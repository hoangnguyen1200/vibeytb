import { NextResponse } from 'next/server';

const ENV_CONFIG = [
  { label: 'Supabase URL', envKey: 'NEXT_PUBLIC_SUPABASE_URL', category: 'core' },
  { label: 'Supabase Anon Key', envKey: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', category: 'core' },
  { label: 'Supabase Service Key', envKey: 'SUPABASE_SERVICE_ROLE_KEY', category: 'core' },
  { label: 'Google Gemini API', envKey: 'GEMINI_API_KEY', category: 'ai' },
  { label: 'ElevenLabs API', envKey: 'ELEVENLABS_API_KEY', category: 'ai' },
  { label: 'ElevenLabs Voice ID', envKey: 'ELEVENLABS_VOICE_ID', category: 'ai' },
  { label: 'YouTube Client ID', envKey: 'YOUTUBE_CLIENT_ID', category: 'publish' },
  { label: 'YouTube Client Secret', envKey: 'YOUTUBE_CLIENT_SECRET', category: 'publish' },
  { label: 'YouTube Refresh Token', envKey: 'YOUTUBE_REFRESH_TOKEN', category: 'publish' },
  { label: 'TikTok Access Token', envKey: 'TIKTOK_ACCESS_TOKEN', category: 'publish' },
  { label: 'Discord Webhook', envKey: 'DISCORD_WEBHOOK_URL', category: 'notify' },
];

export async function GET() {
  const configs = ENV_CONFIG.map(item => ({
    ...item,
    status: process.env[item.envKey] ? 'set' : 'missing',
  }));

  return NextResponse.json({ configs });
}
