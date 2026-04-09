import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { analyzeTopPerformers, selectWeightedTitleStyle } from '../../utils/engagement-analyzer';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY chưa được cấu hình trong file .env');
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * A/B Title Styles — randomly selected per run.
 * Gemini is instructed to follow the pattern for youtube_title.
 */
const TITLE_STYLES = [
  { id: 'question', directive: 'Write the title as a curiosity-gap QUESTION. Example: "Is {tool} the Best Free AI Tool for 2026?"' },
  { id: 'bold_claim', directive: 'Write the title as a BOLD CLAIM. Example: "This AI Tool Does {feature} For FREE 🤯"' },
  { id: 'listicle', directive: 'Write the title as a LISTICLE TEASE. Example: "{tool}: 3 Features That Will Blow Your Mind"' },
  { id: 'urgency', directive: 'Write the title with URGENCY/FOMO. Example: "Stop Sleeping On {tool} — It Won\'t Be Free Forever"' },
];

/**
 * Normalize Gemini's music_mood output to our 3 categories: upbeat | calm | energetic
 */
const MOOD_NORMALIZE: Record<string, string> = {
  // → upbeat
  upbeat: 'upbeat', funky: 'upbeat', happy: 'upbeat', groovy: 'upbeat', pop: 'upbeat',
  // → calm
  calm: 'calm', chill: 'calm', lofi: 'calm', ambient: 'calm', relaxed: 'calm', mellow: 'calm',
  // → energetic
  energetic: 'energetic', epic: 'energetic', synthwave: 'energetic', electronic: 'energetic',
  intense: 'energetic', suspense: 'energetic', cinematic: 'energetic', dramatic: 'energetic',
};

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
    target_search_query: z.string().nullable().optional().describe("A SPECIFIC action query that DEMONSTRATES the tool's main capability. This text will be auto-typed into the website's input/search bar on screen. RULES: (1) Must be a real use-case prompt matching the tool, e.g. Suno→'make a jazz song about rainy nights', Gamma→'create a startup pitch deck', Bolt.new→'build a todo app with React'. (2) NEVER use generic queries like 'Show me how this works'. (3) Each scene MUST have a DIFFERENT, creative query. If target_website_url is null, this MUST be null."),
    estimated_duration: z.number().describe("Estimated duration for this scene in seconds (e.g., 3, 5, 8).")
  })).min(3).max(5).describe("Exactly 3 to 5 scenes perfectly paced to fit under 60 seconds.")
});

export type VideoScriptData = z.infer<typeof VideoScriptSchema>;

export interface GenerateResult {
  script: VideoScriptData;
  titleStyleId: string;
}

const SYSTEM_PROMPT = `
You are "The Tech & Wealth Insider" - An expert Content Strategist specialized in viral YouTube Shorts targeting the "Tech Hacks, AI Tools & Digital Side Hustles" niche for a Western audience.

TASK: Take a [TARGET TOPIC] keyword and craft a complete, highly-engaging 50-second video script.

===== SCRIPT STRUCTURE (~50 seconds) =====

1. HOOK (Scene 1, 5-8s): Attention-grabbing opener with BRIDGE. MUST be 15-25 words minimum (ensures 5+ seconds of speech). Format: [Hook sentence] + [Bridge sentence naming the tool]. The tool name REVEAL happens here — do NOT repeat "It's called [Tool]" in later scenes. Use ONE hook pattern (ROTATE):
   - Curiosity gap: "This free AI tool replaced my $500/month software. It's called [Tool], and here's why."
   - Shock value: "OpenAI just killed a $10 billion industry. But [Tool] is picking up the pieces."
   - Direct benefit: "Make $200/day with this AI nobody talks about. It's called [Tool]."
   - Contrarian: "Stop using ChatGPT. [Tool] is 10x better, and it's completely free."
   - Urgency: "This AI tool won't be free for long. It's called [Tool], and everyone's switching."
   - Question: "Why is nobody talking about [Tool]? It does something incredible."
   - Story: "I found an AI tool that writes entire apps in 30 seconds. Meet [Tool]."
   - Challenge: "You're losing money every day you don't know about [Tool]."

2. BODY (Scenes 2-3, 3-40s): Name the SPECIFIC tool. Explain what it does and why it matters. Use short punchy sentences. Insider/mystery tone. NO fluff, NO dry specs.

3. CLIMAX & CTA (Final scene, 40-50s): Mind-blowing closing thought + verbal engagement CTA. MUST end with ONE of these (ROTATE, never repeat):
   - "Drop a like if this blew your mind, and follow for more AI secrets."
   - "Smash that like button and follow — tomorrow's tool is even crazier."
   - "If this saved you money, hit like and follow for daily AI drops."
   - "Like this if you're switching today. Follow for the next hidden gem."
   - "Follow and like — I'm revealing a new tool every single day."

===== CRITICAL RULES =====

RULE 1 (WORD COUNT): The ENTIRE narration across ALL scenes MUST be 110-120 words total. This ensures the video fits under 60 seconds. Ruthlessly cut fluff.

RULE 2 (NAMED ENTITIES): NEVER say "this secret AI tool" without naming it. You MUST use a REAL, EXISTING tool name (e.g., Gamma, Perplexity, Bolt.new, ElevenLabs, Cursor, Lovable). The tool name MUST appear in Scene 2 or 3 narration.

RULE 3 (KEYWORD INTEGRATION): The [TARGET TOPIC] keyword must naturally appear or be referenced in the narration. Do NOT force it — weave it into the story naturally.

RULE 4 (NO REPETITION): NEVER repeat the same phrase across scenes. Specifically:
- The phrase "It's called [Tool]" or "called [Tool]" must appear EXACTLY ONCE in the entire script (Scene 1 only).
- Scene 2-3 should refer to the tool by name directly (e.g., "HeyGen lets you...") WITHOUT re-introducing it.
- Each scene MUST advance the story — no recycling sentences or ideas from previous scenes.
- Before finalizing, mentally read the FULL script aloud. If any sentence sounds like a repeat of an earlier one, rewrite it with fresh information.

===== FIELD GUIDELINES =====

- \`narration\`: Native conversational American English. Fast-paced, insider tone.
- \`stock_search_keywords\`: 1-3 concrete English nouns for B-roll footage (e.g., "laptop screen", "robot arm", "stock chart"). NO abstract words, NO adjectives, NO time words.
- \`tool_name\`: The EXACT name of the AI tool mentioned in the scene (e.g., "Gamma", "Notion"). Set to null if no specific tool is mentioned.
- \`target_website_url\`: The tool's PUBLIC homepage URL (NOT the app/dashboard). EXACTLY 1-2 scenes should have this. Set null for Hook and CTA scenes. AVOID: chatgpt.com, claude.ai, bard.google.com, character.ai.
- \`target_search_query\`: A SPECIFIC action query demonstrating the tool's main capability. This text is auto-typed into the website's input bar on screen, so it must show a REAL use-case (e.g., Suno→"make a pop song about summer", Lovable→"design a landing page for a coffee shop", Perplexity→"what are the best free AI tools in 2026"). NEVER use generic queries like "Show me how this works". Each scene with a URL MUST have a UNIQUE query. Must be null if target_website_url is null.
- \`music_mood\`: ONE word for the entire video: "lofi", "synthwave", "upbeat", "electronic", or "chill".
- \`youtube_title\`: Under 60 characters. Include the tool name + a power word (Free, Secret, $, Insane, etc.). Add 1 relevant emoji.
- \`youtube_description\`: 2-3 sentences. Include tool name, what it does, and "#shorts #ai #tech".
- \`youtube_tags\`: 5-8 relevant tags. Mix broad ("ai tools") + specific ("gamma ai", "free presentation maker").
- \`estimated_duration\`: Scene duration in seconds. Hook = 5-8s (MINIMUM 5s), Body scenes = 8-15s, CTA = 5-8s.

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
      "estimated_duration": 6
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


export async function generateScriptFromTrend(keyword: string, language: string = 'en-US', tone: string = 'casual and engaging American English', avoidTools: string[] = [], toolData?: { name: string; tagline: string; url: string }): Promise<GenerateResult> {
  let retries = 5;
  let lastError: unknown;
  let currentModel = model;
  const modelTiers = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  let currentTier = 0;

  while (retries > 0) {
    try {
      console.log(`🧠 [Gemini] Scripting for keyword: "${keyword}" (Target: ${language}, Tone: ${tone})... (Remaining retries: ${retries})`);

      // A/B Title Style — weighted by engagement performance
      let titleStyleId: string;
      try {
        const insights = await analyzeTopPerformers();
        titleStyleId = selectWeightedTitleStyle(insights.titleStyleWeights);
      } catch {
        // Fallback to random if engagement analysis fails
        titleStyleId = TITLE_STYLES[Math.floor(Math.random() * TITLE_STYLES.length)].id;
      }
      const titleStyle = TITLE_STYLES.find(s => s.id === titleStyleId) || TITLE_STYLES[0];
      console.log(`[A/B TITLE] Using style: "${titleStyle.id}" (engagement-weighted)`);
      
      let prompt = `Current Trending Keyword: "${keyword}". Please craft an engaging video script immediately!
      Target Language/Locale: ${language}
      Required Tone of Voice: ${tone}

      TITLE STYLE DIRECTIVE: ${titleStyle.directive}`;

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

      // Normalize music_mood to our 3 categories
      const rawMood = (validatedData.music_mood || 'upbeat').toLowerCase().trim();
      validatedData.music_mood = MOOD_NORMALIZE[rawMood] || 'upbeat';
      console.log(`[BGM MOOD] Gemini said "${rawMood}" → normalized to "${validatedData.music_mood}"`);
      console.log(`[A/B TITLE] Generated: "${validatedData.youtube_title}"`);

      return { script: validatedData, titleStyleId: titleStyle.id };

    } catch (error: any) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (error.status === 429 || error.status === 404 || errorMessage.toLowerCase().includes('quota')) {
        currentTier = Math.min(currentTier + 1, modelTiers.length - 1);
        console.log(`[MODEL FALLBACK] Switching to ${modelTiers[currentTier]}`);
        currentModel = genAI.getGenerativeModel({ model: modelTiers[currentTier] });
      } else {
        console.warn(`⚠️ Gemini API Lỗi/Malformed JSON. Đang thử lại... Chi tiết: ${errorMessage}`);
      }
      
      retries--;

      // Exponential backoff: 3s → 6s → 12s → 24s, with 30s for rate limits
      const attempt = 5 - retries;
      const isRateLimit = error.status === 429 || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate');
      const isTransient = errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('fetch');
      const jitter = Math.random() * 3000; // 0-3s random jitter
      const backoffMs = (isRateLimit ? 30000 : isTransient ? 5000 : 3000 * Math.pow(2, attempt - 1)) + jitter;
      console.log(`[BACKOFF] Waiting ${(backoffMs / 1000).toFixed(0)}s before retry (attempt ${attempt}/5, ${isRateLimit ? 'rate-limit' : isTransient ? 'transient' : 'standard'})`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

  }

  const finalErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`❌ Gemini Failed sau 5 lần rặn kịch bản: ${finalErrorMessage}`);
}
