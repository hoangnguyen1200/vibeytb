import { z } from 'zod';

export enum VideoStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED_FOR_SYNTHESIS = 'approved_for_synthesis',
  READY_FOR_VIDEO = 'ready_for_video',
  READY_FOR_UPLOAD = 'ready_for_upload',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export const ScriptSceneSchema = z.object({
  scene_index: z.number().int().min(1),
  narration: z.string().min(1),
  stock_search_keywords: z.string().min(1).nullable().optional(),
  target_website_url: z.string().min(1).nullable().optional(),
  target_search_query: z.string().min(1).nullable().optional(),
  tool_name: z.string().min(1).nullable().optional(),
  estimated_duration: z.number().positive(),
});

export const ScriptJsonSchema = z.object({
  youtube_title: z.string().min(1),
  youtube_description: z.string().min(1),
  youtube_tags: z.array(z.string().min(1)),
  music_mood: z.string().min(1),
  scenes: z.array(ScriptSceneSchema).min(3).max(5),
});

export type ScriptScene = z.infer<typeof ScriptSceneSchema>;
export type ScriptJson = z.infer<typeof ScriptJsonSchema>;

export interface VideoProject {
  id: string;
  status: VideoStatus;
  target_language?: string | null;
  tone_of_voice?: string | null;
  script_json?: ScriptJson | string | null;
  youtube_title?: string | null;
  youtube_description?: string | null;
  youtube_tags?: string[] | null;
  youtube_url?: string | null;
  tiktok_url?: string | null;
  error_logs?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
