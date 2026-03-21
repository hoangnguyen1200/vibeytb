import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY chưa được cấu hình trong file .env');
}

const genAI = new GoogleGenerativeAI(apiKey);
// Sử dụng model mới nhất và mạnh mẽ nhất cho suy luận logic phức tạp (Structured Output)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Schema định dạng dữ liệu trả về theo Zod để ép kiểu Output JSON
export const VideoScriptSchema = z.object({
  youtube_title: z.string().describe("Catchy, click-worthy hook title (Under 60 characters)"),
  youtube_description: z.string().describe("Short engaging description with relevant #shorts #trend hashtags"),
  youtube_tags: z.array(z.string()).describe("Array of related keywords (Max 5 tags)"),
  music_mood: z.string().describe("Exactly 1 word representing the overall emotion/vibe for background music (e.g. 'epic', 'lofi', 'upbeat', 'suspense', 'chill', 'sad'). DO NOT use phrases."),
  scenes: z.array(z.object({
    scene_index: z.number(),
    narration: z.string().describe("Engaging voiceover text written in native American English. MUST start with a shocking 3-second 'Killer Hook' (under 10 words) at scene 1. Use short sentences, fast-paced storytelling/mystery style. ENTIRE SCRIPT MUST BE 110-120 WORDS MAXIMUM (roughly 50 seconds)."),
    stock_search_keywords: z.string().nullable().optional().describe("Exactly 1-3 words representing the 'Macro-Context' (Main Topic) of the entire script/scene. MUST be concrete (e.g., 'cargo ship', 'stock market', 'computer server'). STRICTLY PROHIBITED to use abstract adjectives, quantities, or time words like 'daily', 'one', 'very', 'tech integration'."),
    target_website_url: z.string().nullable().optional().describe("CRITICAL: CHỈ ĐƯỢC dùng các domain sau: reddit.com, github.com, producthunt.com, news.ycombinator.com, wikipedia.org, gumroad.com, explodingtopics.com, trends.google.com. TUYỆT ĐỐI KHÔNG dùng bất kỳ domain nào khác. Nếu không có URL phù hợp trong whitelist thì đặt target_website_url: null."),
    target_search_query: z.string().nullable().optional().describe("A search query logically matching the scene's narration. Example: if narration is about Perplexity AI, the query MUST be a contextual question like 'What are the best productivity tools for 2025?' and NOT generic commands like 'Summarize this page'. This will be auto-typed into the website search bar. If target_website_url is null, this MUST be null."),
    estimated_duration: z.number().describe("Estimated duration for this scene in seconds (e.g., 3, 5, 8).")
  })).min(3).max(5).describe("Exactly 3 to 5 scenes perfectly paced to fit under 60 seconds.")
});

export type VideoScriptData = z.infer<typeof VideoScriptSchema>;

// LLM System Prompt configured for Global Expansion
const SYSTEM_PROMPT = `
You are "The Tech & Wealth Insider" - An expert Content Strategist and Scriptwriter specialized in viral YouTube Shorts targeting the "Tech Hacks, AI Tools & Digital Side Hustles" niche.
Your task is to take a [TARGET TOPIC] and write a complete, highly-engaging video script for a Western audience.

SCRIPT STRUCTURE (~50s):
1. HOOK (0-3s): Grab attention instantly. MUST be a 'Killer Hook' under 10 words (e.g., "This AI tool feels illegal to know..." or "Stop losing money on broken affiliate links").
2. BODY (3-40s): Deliver 1-2 highly practical, actionable tech/wealth building tips. Use short sentences, fast-paced rhythm, and a mystery/insider tone. No fluff, no dry specs.
3. CLIMAX & CTA (40-50s): Deliver a final mind-blowing thought, followed by a Call-To-Action to subscribe for more tech tips.
CRITICAL RULE 1: The ENTIRE script narration (all scenes combined) MUST be strictly between 110 and 120 words. This ensures the video stays well under the 60 seconds Shorts limit. Cut all fluff.

CRITICAL RULE 2 (NAMED ENTITIES ONLY): You MUST NEVER use generic terms like "This secret AI tool" in the body without naming it. You MUST choose a REAL, EXISTING software or website (e.g., ChatPDF, Gamma.app, Perplexity, ElevenLabs, Vercel, Gumroad). The script MUST read the exact name of this specific tool out loud in Scene 2 or Scene 3.

SCENE REQUIREMENTS & DEMOGRAPHICS constraints:
- \`narration\`: Generate content exclusively in native, conversational American English. The tone is insider, fast-paced, and engaging.
- \`stock_search_keywords\`: Extract the "Macro-Context" of the scene. Provide EXACTLY 1 to 3 simple English words. It MUST be a concrete noun/concept related to the broad topic (e.g., "cargo ship", "data center", "smartphone", "office worker"). YOU MUST AVOID secondary keywords denoting time, quantity, or adverbs (e.g., "daily", "one", "very", "time"). DO NOT use abstract concepts or sentences.
- \`music_mood\`: Define exactly ONE word for the background music vibe of the entire video. Limit to focused, modern vibes: "lofi", "synthwave", "upbeat", "electronic", or "chill". Do NOT write a sentence.

CRITICAL RULE 3 (THE CAMERAMAN TRIGGER):
- \`target_website_url\`: Out of the 4-5 total scenes, EXACTLY 1 OR 2 scenes MUST have a valid homepage URL in this field. CHỈ ĐƯỢC dùng các domain sau: reddit.com, github.com, producthunt.com, news.ycombinator.com, wikipedia.org, gumroad.com, explodingtopics.com, trends.google.com. TUYỆT ĐỐI KHÔNG dùng bất kỳ domain nào khác. Nếu không có URL phù hợp thì đặt null.
- Hook (Scene 1) and Outro (final scene) should usually leave this as null or empty.
- If target_website_url has a value, stock_search_keywords will be ignored. If NULL, we will use stock_search_keywords for generic B-roll.

ATTENTION:
- BẠN BẮT BUỘC PHẢI TRẢ VỀ JSON KHỚP ĐÚNG FORMAT SAU ĐÂY:
{
  "youtube_title": "string (dưới 60 ký tự)",
  "youtube_description": "string",
  "youtube_tags": ["string", "string"],
  "music_mood": "string (1 word only)",
  "scenes": [
    {
      "scene_index": 1,
      "narration": "string",
      "stock_search_keywords": "string (1-2 concrete nouns only)",
      "target_website_url": "string | null",
      "target_search_query": "string | null",
      "estimated_duration": 5
    }
  ]
}
Không thêm bất kỳ text định dạng Markdown nào khác như \`\`\`json. CHỈ output RAW JSON.
`;

export async function generateScriptFromTrend(keyword: string, language: string = 'en-US', tone: string = 'casual and engaging American English'): Promise<VideoScriptData> {
  let retries = 3;
  let lastError: unknown;
  let currentModel = model;

  while (retries > 0) {
    try {
      console.log(`🧠 [Gemini] Scripting for keyword: "${keyword}" (Target: ${language}, Tone: ${tone})... (Remaining retries: ${retries})`);
      
      const prompt = `Current Trending Keyword: "${keyword}". Please craft an engaging video script immediately!
      Target Language/Locale: ${language}
      Required Tone of Voice: ${tone}`;

      // Call LLM
      const result = await currentModel.generateContent({
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ],
        systemInstruction: SYSTEM_PROMPT,
        // Ép trả về JSON format
        generationConfig: {
            responseMimeType: "application/json",
        }
      });

      const responseText = result.response.text();
      
      if (!responseText) {
        throw new Error('Gemini trả về rỗng.');
      }

      // Parse JSON
      const parsedJson = JSON.parse(responseText);
      
      // Fallback an toàn: Nếu AI cấu trúc đúng nhưng trả về null cho stock_search_keywords
      if (parsedJson && Array.isArray(parsedJson.scenes)) {
          parsedJson.scenes = parsedJson.scenes.map((scene: { stock_search_keywords?: string | null; [key: string]: unknown }) => {
              if (scene.stock_search_keywords === null || scene.stock_search_keywords === undefined || scene.stock_search_keywords === "") {
                  // Fallback an toàn thuộc chủ đề công nghệ, mạng rỗng
                  const safeFallbacks = ["abstract technology", "digital network", "data flow"];
                  scene.stock_search_keywords = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)]; 
              }
              return scene;
          });
      }

      // Validate bằng Zod
      const validatedData = VideoScriptSchema.parse(parsedJson);

      return validatedData;

    } catch (error: any) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (error.status === 429 || error.status === 404 || errorMessage.toLowerCase().includes('quota')) {
        console.log('[MODEL FALLBACK] gemini-2.5-flash quota exceeded, switching to gemini-1.5-flash-latest');
        currentModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
      } else {
        console.warn(`⚠️ Gemini API Lỗi/Malformed JSON. Đang thử lại... Chi tiết: ${errorMessage}`);
      }
      
      retries--;
      // Backoff 2 giây
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  const finalErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`❌ Gemini Failed sau 3 lần rặn kịch bản: ${finalErrorMessage}`);
}
