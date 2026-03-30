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
    tool_name: z.string().nullable().optional().describe("The EXACT name of the AI tool/software mentioned in this scene's narration (e.g., 'Gamma', 'Notion', 'ElevenLabs', 'Perplexity'). If no specific tool is mentioned, set to null."),
    target_website_url: z.string().nullable().optional().describe("Use any public URL that does NOT require login. AVOID heavy anti-bot sites: chatgpt.com, chat.openai.com, claude.ai, bard.google.com, character.ai. Prefer tool homepages, landing pages, or product pages. If the tool requires login or is known to block bots, set target_website_url to null."),
    target_search_query: z.string().nullable().optional().describe("A search query logically matching the scene's narration. Example: if narration is about Perplexity AI, the query MUST be a contextual question like 'What are the best productivity tools for 2025?' and NOT generic commands like 'Summarize this page'. This will be auto-typed into the website search bar. If target_website_url is null, this MUST be null."),
    estimated_duration: z.number().describe("Estimated duration for this scene in seconds (e.g., 3, 5, 8).")
  })).min(3).max(5).describe("Exactly 3 to 5 scenes perfectly paced to fit under 60 seconds.")
});

export type VideoScriptData = z.infer<typeof VideoScriptSchema>;

const SYSTEM_PROMPT = `
You are "The Tech & Wealth Insider" - An expert Content Strategist specialized in viral YouTube Shorts targeting the "Tech Hacks, AI Tools & Digital Side Hustles" niche for a Western audience.

TASK: Take a [TARGET TOPIC] keyword and craft a complete, highly-engaging 50-second video script.

===== SCRIPT STRUCTURE (~50 seconds) =====

1. HOOK (Scene 1, 0-3s): Ultra-short attention grabber. Under 10 words. Use ONE of these proven patterns (ROTATE, never repeat the same pattern twice in a row):
   - Curiosity gap: "This free AI tool replaced my $500/month software..."
   - Shock value: "OpenAI just killed a $10 billion industry."
   - Direct benefit: "Make $200/day with this AI nobody talks about."
   - Contrarian: "Stop using ChatGPT. This is 10x better."
   - Urgency: "This AI tool won't be free for long."
   - Question: "Why is nobody talking about this AI?"
   - Story: "I found an AI tool that writes entire apps..."
   - Challenge: "You're losing money if you don't know this tool."

2. BODY (Scenes 2-3, 3-40s): Name the SPECIFIC tool. Explain what it does and why it matters. Use short punchy sentences. Insider/mystery tone. NO fluff, NO dry specs.

3. CLIMAX & CTA (Final scene, 40-50s): Mind-blowing closing thought + "Follow for more hidden AI gems."

===== CRITICAL RULES =====

RULE 1 (WORD COUNT): The ENTIRE narration across ALL scenes MUST be 110-120 words total. This ensures the video fits under 60 seconds. Ruthlessly cut fluff.

RULE 2 (NAMED ENTITIES): NEVER say "this secret AI tool" without naming it. You MUST use a REAL, EXISTING tool name (e.g., Gamma, Perplexity, Bolt.new, ElevenLabs, Cursor, Lovable). The tool name MUST appear in Scene 2 or 3 narration.

RULE 3 (KEYWORD INTEGRATION): The [TARGET TOPIC] keyword must naturally appear or be referenced in the narration. Do NOT force it — weave it into the story naturally.

===== FIELD GUIDELINES =====

- \`narration\`: Native conversational American English. Fast-paced, insider tone.
- \`stock_search_keywords\`: 1-3 concrete English nouns for B-roll footage (e.g., "laptop screen", "robot arm", "stock chart"). NO abstract words, NO adjectives, NO time words.
- \`tool_name\`: The EXACT name of the AI tool mentioned in the scene (e.g., "Gamma", "Notion"). Set to null if no specific tool is mentioned.
- \`target_website_url\`: The tool's PUBLIC homepage URL (NOT the app/dashboard). EXACTLY 1-2 scenes should have this. Set null for Hook and CTA scenes. AVOID: chatgpt.com, claude.ai, bard.google.com, character.ai.
- \`target_search_query\`: A contextual search query for the website. Must be null if target_website_url is null.
- \`music_mood\`: ONE word for the entire video: "lofi", "synthwave", "upbeat", "electronic", or "chill".
- \`youtube_title\`: Under 60 characters. Include the tool name + a power word (Free, Secret, $, Insane, etc.). Add 1 relevant emoji.
- \`youtube_description\`: 2-3 sentences. Include tool name, what it does, and "#shorts #ai #tech".
- \`youtube_tags\`: 5-8 relevant tags. Mix broad ("ai tools") + specific ("gamma ai", "free presentation maker").
- \`estimated_duration\`: Scene duration in seconds. Hook = 3s, Body scenes = 5-10s, CTA = 3-5s.

===== EXAMPLE OUTPUT =====

{
  "youtube_title": "This FREE AI Builds Apps in Seconds 🤯",
  "youtube_description": "Bolt.new lets you build full-stack web apps just by describing what you want. No coding required. The future of development is here. #shorts #ai #tech",
  "youtube_tags": ["ai tools", "bolt new", "no code", "web development", "ai app builder", "free ai tools", "tech tips"],
  "music_mood": "synthwave",
  "scenes": [
    {
      "scene_index": 1,
      "narration": "This AI builds entire apps in 30 seconds.",
      "stock_search_keywords": "computer code",
      "tool_name": null,
      "target_website_url": null,
      "target_search_query": null,
      "estimated_duration": 3
    },
    {
      "scene_index": 2,
      "narration": "It's called Bolt dot new. You type what you want, and it writes the code, designs the UI, and deploys it live. Full stack. No coding skills needed.",
      "stock_search_keywords": "web application",
      "tool_name": "Bolt.new",
      "target_website_url": "https://bolt.new",
      "target_search_query": "build a landing page",
      "estimated_duration": 10
    },
    {
      "scene_index": 3,
      "narration": "Freelancers are charging clients thousands for work this tool does in minutes. And right now, it's completely free.",
      "stock_search_keywords": "freelancer laptop",
      "tool_name": "Bolt.new",
      "target_website_url": null,
      "target_search_query": null,
      "estimated_duration": 8
    },
    {
      "scene_index": 4,
      "narration": "The people who learn these tools early will dominate. Follow for more hidden AI gems.",
      "stock_search_keywords": "success growth",
      "tool_name": null,
      "target_website_url": null,
      "target_search_query": null,
      "estimated_duration": 5
    }
  ]
}

===== OUTPUT FORMAT =====

Return ONLY raw JSON matching the structure above. No markdown, no code fences, no extra text.
`;


export async function generateScriptFromTrend(keyword: string, language: string = 'en-US', tone: string = 'casual and engaging American English', avoidTools: string[] = [], toolData?: { name: string; tagline: string; url: string }): Promise<VideoScriptData> {
  let retries = 3;
  let lastError: unknown;
  let currentModel = model;

  while (retries > 0) {
    try {
      console.log(`🧠 [Gemini] Scripting for keyword: "${keyword}" (Target: ${language}, Tone: ${tone})... (Remaining retries: ${retries})`);
      
      let prompt = `Current Trending Keyword: "${keyword}". Please craft an engaging video script immediately!
      Target Language/Locale: ${language}
      Required Tone of Voice: ${tone}`;

      // Real tool data: inject tool info to prevent LLM hallucination
      if (toolData) {
        prompt += `\n\nIMPORTANT — REAL TOOL DATA (verified, trending today):
- Tool Name: "${toolData.name}"
- Tagline: "${toolData.tagline}"
- Website URL: ${toolData.url}

You MUST write the script about THIS specific tool. Use the EXACT tool name "${toolData.name}" in scenes 2-3.
Set target_website_url to "${toolData.url}" for scenes 2-3 (body scenes).
The tool_name field MUST be "${toolData.name}" for scenes where the tool is mentioned.`;
      }

      // Content Memory: inject avoid list
      if (avoidTools.length > 0) {
        prompt += `\n\nCRITICAL - CONTENT MEMORY: You have ALREADY covered these tools in the past 7 days. You MUST NOT use any of them: ${avoidTools.join(', ')}. Pick a DIFFERENT tool!`;
        console.log(`[CONTENT MEMORY] 🚫 Avoiding tools: ${avoidTools.join(', ')}`);
      }

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
