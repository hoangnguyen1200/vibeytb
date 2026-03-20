import { ffmpeg } from '../../utils/ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Step 1: Merge audio + video per scene
 * - Scale/pad 9:16
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
        {
          filter: 'scale',
          options: '1080:1920:force_original_aspect_ratio=decrease',
          inputs: '0:v',
          outputs: 'scaled_v'
        },
        {
          filter: 'pad',
          options: '1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
          inputs: 'scaled_v',
          outputs: 'padded_v'
        },
        {
          filter: 'subtitles',
          options: `'${escapedVttPath}':force_style='Fontname=Impact,Fontsize=18,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=60'`,
          inputs: 'padded_v',
          outputs: 'sub_v'
        },
        {
          filter: 'silenceremove',
          options: 'start_periods=1:start_duration=0.3:start_threshold=-30dB:stop_periods=1:stop_duration=0.3:stop_threshold=-30dB',
          inputs: '1:a',
          outputs: 'trim_a'
        },
        {
          filter: 'aresample',
          options: '48000',
          inputs: 'trim_a',
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
        '-crf 20',
        '-maxrate 8M',
        '-bufsize 12M',
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
        console.log(`[FFmpeg] Mixing BGM: ${path.basename(bgmPath)} (volume 10%)`);
        audioMap = '[a_mix]';
        mixCmd
          .input(bgmPath)
          .inputOptions(['-stream_loop', '-1'])
          .complexFilter([
            '[1:a]volume=0.1[bgm]',
            '[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[a_mix]'
          ]);
      }

      mixCmd
        .outputOptions([
          '-map 0:v',
          `-map ${audioMap}`,
          '-c:v copy',
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
      try { fs.unlinkSync(tempConcat); } catch (e) {}
    }
  }
}

