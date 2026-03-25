import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * BGM Client — Selects background music from local assets/bgm/ directory.
 * Previously used Pixabay API which has been removed (403 errors, unnecessary dependency).
 *
 * @param mood Mood keyword (for logging only, not used for selection)
 * @param projectId Job ID for tmp directory
 * @returns Path to local BGM file or null
 */
export async function downloadBGMFromPixabay(mood: string, projectId: string): Promise<string | null> {
  console.log(`🎵 [BGM] Selecting local BGM (mood: "${mood}")...`);

  const bgmDir = path.join(process.cwd(), 'assets', 'bgm');
  if (fs.existsSync(bgmDir)) {
    const files = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
    if (files.length > 0) {
      const randomFile = files[Math.floor(Math.random() * files.length)];
      const bgmPath = path.join(bgmDir, randomFile);
      console.log(`   ✅ [BGM] Selected: ${randomFile}`);
      return bgmPath;
    }
  }
  console.log(`   ❌ [BGM] No BGM files in assets/bgm/. Skipping BGM.`);
  return null;
}
