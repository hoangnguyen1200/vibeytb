import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * BGM Mood Categories — map file keywords to moods.
 * Files are matched by artist/title keywords to select mood-appropriate BGM.
 */
const MOOD_MAP: Record<string, string[]> = {
  // Upbeat / energetic — for product launches, exciting tools
  upbeat: [
    'Fun Vibe', 'Dance By Yourself', 'Groove', 'GTA Type Beat',
    'Van Life Rager', 'Wrangle The Crazy', 'Drum Or Bass',
    'All In', 'Regulate', 'Glitcher',
  ],
  // Calm / ambient — for utility tools, productivity apps
  calm: [
    'A Light Through All The Darkness', 'Moonlit', 'Maple',
    'When You\'re Alone', 'Only Little', 'For Granted',
    'I Need You', 'Just Surrender', 'Friendship Wand',
  ],
  // Energetic / cinematic — for AI breakthroughs, impressive demos
  energetic: [
    'Intergalactic', 'The Light', 'The Theme',
    'A Dyin\' Breed', 'Dismantled Toys', 'On The Eve',
    'Spatial Entaglement', 'The Last Oasis',
    'Sly Sky', 'Name The Time And Place', 'Fontana',
  ],
};

/**
 * BGM Client — Selects mood-appropriate background music from local assets/bgm/.
 *
 * @param mood Target mood ('upbeat' | 'calm' | 'energetic') — matches BGM by keyword
 * @param projectId Job ID (unused, kept for API compatibility)
 * @returns Path to local BGM file or null
 */
export async function downloadBGMFromPixabay(mood: string, projectId: string): Promise<string | null> {
  const bgmDir = path.join(process.cwd(), 'assets', 'bgm');
  if (!fs.existsSync(bgmDir)) {
    console.log(`   ❌ [BGM] No assets/bgm/ directory. Skipping BGM.`);
    return null;
  }

  const allFiles = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (allFiles.length === 0) {
    console.log(`   ❌ [BGM] No BGM files in assets/bgm/. Skipping BGM.`);
    return null;
  }

  // Normalize mood
  const normalizedMood = mood.toLowerCase().trim();
  const moodKeywords = MOOD_MAP[normalizedMood] || [];

  // Try mood match first
  if (moodKeywords.length > 0) {
    const matched = allFiles.filter(f =>
      moodKeywords.some(keyword => f.toLowerCase().includes(keyword.toLowerCase()))
    );

    if (matched.length > 0) {
      const selected = matched[Math.floor(Math.random() * matched.length)];
      console.log(`🎵 [BGM] Mood "${mood}" → ${matched.length} matches → Selected: ${selected}`);
      return path.join(bgmDir, selected);
    }

    console.log(`🎵 [BGM] No match for mood "${mood}" → falling back to random`);
  }

  // Fallback: random from all
  const selected = allFiles[Math.floor(Math.random() * allFiles.length)];
  console.log(`🎵 [BGM] Random fallback → Selected: ${selected}`);
  return path.join(bgmDir, selected);
}
