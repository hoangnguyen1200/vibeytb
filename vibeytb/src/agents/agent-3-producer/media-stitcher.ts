import { ffmpeg } from '../../utils/ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Step 1: Merge audio + video per scene
 * - Scale to 1080px wide, pad to 1080x1920
 * - Burn subtitles
 * - Trim dead air (silenceremove)
 * - Force stereo 48kHz / 128k
 * - Encode video for crisp UI/text
 */
export async function mergeAudioVideoScene(
  videoPath: string,
  audioPath: string,
  outputScenePath: string,
  duration: number,
  vttPath: string
): Promise<string> {
  console.log(`[FFmpeg] Merging audio into video -> ${outputScenePath}`);

  return new Promise((resolve, reject) => {
    const escapedVttPath = vttPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    ffmpeg()
      .input(videoPath)
      // Skip first 2s of Playwright recording (page load = blank frame)
      .inputOptions(['-ss', '2', '-stream_loop', '-1'])
      .input(audioPath)
      .complexFilter([
        // Scale to exactly 1080px wide (handles edge cases)
        {
          filter: 'scale',
          options: { w: 1080, h: -2 },
          inputs: '0:v',
          outputs: 'scaled_v'
        },
        // Pad to 9:16 portrait (center vertically, black bars top/bottom)
        {
          filter: 'pad',
          options: '1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
          inputs: 'scaled_v',
          outputs: 'padded_v'
        },
        // Subtitles: modern viral-style (compact, semi-transparent bg, safe zone)
        // Fontsize=16 on 1080x1920 = readable on mobile without being intrusive
        // BorderStyle=4 = box + outline (semi-transparent dark background behind text)
        // MarginV=120 = bottom black padding zone (y~1800), avoids YouTube UI (buttons ~y1700) AND website content (ends ~y1560)
        {
          filter: 'subtitles',
          options: `'${escapedVttPath}':force_style='Fontname=Arial,Fontsize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H40000000,BackColour=&H80000000,BorderStyle=4,Outline=1,Shadow=0,Alignment=2,MarginV=120,MarginL=80,MarginR=80,Bold=1'`,
          inputs: 'padded_v',
          outputs: 'sub_v'
        },
        // NOTE: silenceremove was removed — it was cutting 75-87% of narration
        // because TTS has natural 0.3s+ pauses between sentences that the filter
        // treated as "trailing silence" and removed. Minor trailing dead air from
        // Edge TTS is acceptable vs losing narration.
        {
          filter: 'aresample',
          options: '48000',
          inputs: '1:a',
          outputs: 'resample_a'
        },
        {
          filter: 'aformat',
          options: 'channel_layouts=stereo',
          inputs: 'resample_a',
          outputs: 'final_a'
        }
      ])
      .outputOptions([
        '-map [sub_v]',
        '-map [final_a]',
        '-c:v libx264',
        '-preset fast',
        '-b:v 8M',
        '-minrate 8M',
        '-maxrate 8M',
        '-bufsize 16M',
        '-pix_fmt yuv420p',
        '-r 30',
        '-c:a aac',
        '-b:a 128k',
        '-ar 48000',
        '-ac 2',
        '-shortest',
        `-t ${duration}`,
        '-max_muxing_queue_size', '2048',
        '-movflags +faststart'
      ])
      .save(outputScenePath)
      .on('end', () => {
        console.log(`[FFmpeg] Scene merge complete.`);
        resolve(outputScenePath);
      })
      .on('error', (err) => {
        console.error(`[FFmpeg] Scene merge failed:`, err);
        reject(err);
      });
  });
}

/**
 * Step 2: Concatenate scenes into final video
 * - Uses concat FILTER (not demuxer) to handle different codec params across scenes
 * - Mix BGM if provided
 * - Loudnorm AFTER mix to hit -16 LUFS
 * - Force stereo 48kHz / 128k
 */
export async function concatScenes(
  sceneFiles: string[],
  finalOutput: string,
  projectId: string,
  bgmPath: string | null = null
): Promise<string> {
  console.log(`[FFmpeg] Concatenating ${sceneFiles.length} scenes...`);

  // Append outro CTA scene (best-effort)
  try {
    const { generateOutro } = await import('./outro-generator.js');
    const outroPath = await generateOutro(projectId);
    sceneFiles = [...sceneFiles, outroPath];
    console.log(`[CONCAT] Appended outro CTA -> ${sceneFiles.length} total scenes`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[CONCAT] Outro generation failed (non-fatal): ${msg}`);
  }

  const tmpDir = path.join(process.cwd(), 'tmp', projectId);
  if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
  }
  const tempConcat = path.join(tmpDir, 'temp_concat_no_bgm.mp4');

  try {
    // Phase 1: Concat using the concat FILTER (not demuxer)
    // Why: concat demuxer (-c copy) silently drops audio when scenes have
    // different codec params (website recording vs stock video have different
    // AAC headers/timestamps). The concat filter re-decodes all inputs and
    // properly interleaves streams, then re-encodes at 8M to preserve quality.
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();

      // Add each scene as a separate input
      for (const f of sceneFiles) {
        cmd.input(f);
      }

      // Build concat filter: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1
      const filterParts = sceneFiles.map((_, i) => `[${i}:v][${i}:a]`).join('');
      const concatFilter = `${filterParts}concat=n=${sceneFiles.length}:v=1:a=1[outv][outa]`;

      cmd
        .complexFilter([concatFilter])
        .outputOptions([
          '-map [outv]',
          '-map [outa]',
          '-c:v libx264',
          '-preset fast',
          '-b:v 8M',
          '-minrate 8M',
          '-maxrate 8M',
          '-bufsize 16M',
          '-pix_fmt yuv420p',
          '-r 30',
          '-c:a aac',
          '-b:a 128k',
          '-ar 48000',
          '-ac 2',
          '-movflags +faststart'
        ])
        .save(tempConcat)
        .on('end', () => {
          console.log(`[FFmpeg] Concat complete.`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[FFmpeg] Concat failed:`, err);
          reject(err);
        });
    });

    // Phase 2: Mix BGM + Loudnorm
    console.log(`[FFmpeg] Processing audio (BGM + loudnorm)...`);
    await new Promise<void>((resolve, reject) => {
      const mixCmd = ffmpeg().input(tempConcat);
      let audioMap = '';

      if (!bgmPath) {
        console.log(`[FFmpeg] No BGM. Running loudnorm only.`);
        audioMap = '[a_norm]';
        mixCmd.complexFilter([
          '[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[a_norm]'
        ]);
      } else {
        console.log(`[FFmpeg] Mixing BGM: ${path.basename(bgmPath)} (volume 15%)`);
        audioMap = '[a_mix]';
        mixCmd
          .input(bgmPath)
          .inputOptions(['-stream_loop', '-1'])
          .complexFilter([
            '[1:a]volume=0.15[bgm]',
            '[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[a_mix]'
          ]);
      }

      mixCmd
        .outputOptions([
          '-map 0:v',
          `-map ${audioMap}`,
          '-c:v libx264',
          '-preset fast',
          '-b:v 8M',
          '-minrate 8M',
          '-maxrate 8M',
          '-bufsize 16M',
          '-c:a aac',
          '-b:a 128k',
          '-ar 48000',
          '-ac 2',
          '-movflags +faststart'
        ])
        .save(finalOutput)
        .on('end', () => {
          console.log(`[FFmpeg] Final output saved: ${finalOutput}`);
          resolve();
        })
        .on('error', (mixErr) => {
          console.error(`[FFmpeg] Audio processing failed:`, mixErr);
          reject(mixErr);
        });
    });

    return finalOutput;
  } finally {
    // Cleanup: remove intermediate files
    if (fs.existsSync(tempConcat)) {
      try { fs.unlinkSync(tempConcat); } catch {}
    }
    const concatListCleanup = path.join(tmpDir, 'concat_list.txt');
    if (fs.existsSync(concatListCleanup)) {
      try { fs.unlinkSync(concatListCleanup); } catch {}
    }
  }
}
