import { ffmpeg } from '../../utils/ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Step 1: Merge audio + video per scene
 * - Center-crop 1920×1080 → 1080×1080, then pad to 1080×1920
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
      .inputOptions(['-stream_loop', '-1'])
      .input(audioPath)
      .complexFilter([
        // Scale UP to at least 1080px wide before cropping (handles any input size)
        {
          filter: 'scale',
          options: {
            w: 'if(lt(iw,1080),1080,-2)',
            h: 'if(lt(iw,1080),-2,ih)'
          },
          inputs: '0:v',
          outputs: 'scaled_v'
        },
        {
          filter: 'crop',
          options: {
            w: 'min(iw,1080)',
            h: 'min(ih,1080)',
            x: '(iw-min(iw,1080))/2',
            y: 0
          },
          inputs: 'scaled_v',
          outputs: 'cropped_v'
        },
        {
          filter: 'pad',
          options: '1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
          inputs: 'cropped_v',
          outputs: 'padded_v'
        },
        {
          filter: 'subtitles',
          options: `'${escapedVttPath}':force_style='Fontname=Impact,Fontsize=36,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&HC0000000,BorderStyle=3,Outline=0,Shadow=0,Alignment=2,MarginV=120,Bold=1'`,
          inputs: 'padded_v',
          outputs: 'sub_v'
        },
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
    console.log(`[CONCAT] Appended outro CTA → ${sceneFiles.length} total scenes`);
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
    // Phase 1: Concat video files
    await new Promise<void>((resolve, reject) => {
      const concatCommand = ffmpeg();
      sceneFiles.forEach((file) => concatCommand.input(file));
      concatCommand
        .on('error', (err) => {
          console.error(`[FFmpeg] Concat failed:`, err);
          reject(err);
        })
        .on('end', () => {
          console.log(`[FFmpeg] Concat complete.`);
          resolve();
        })
        .mergeToFile(tempConcat, tmpDir);
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
    // Vệ sinh môi trường: Xóa file trung gian sau khi đã lưu xong video hoàn chỉnh
    if (fs.existsSync(tempConcat)) {
      try { fs.unlinkSync(tempConcat); } catch {}
    }
  }
}

