import fs from 'fs';

/**
 * Detect a usable font for FFmpeg drawtext on the current OS.
 * Linux (GitHub Actions) doesn't have Impact — use system fallback.
 * Returns { fontfile, fontname } to use in FFmpeg drawtext options.
 */
export function detectFont(): { fontfile: string; fontname: string } {
  // Linux system font paths (GitHub Actions Ubuntu runners)
  const linuxFonts = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf',
  ];

  for (const fontPath of linuxFonts) {
    if (fs.existsSync(fontPath)) {
      return { fontfile: fontPath, fontname: '' };
    }
  }

  // Windows: use fontfile with absolute path (font= by name is unreliable in FFmpeg)
  if (process.platform === 'win32') {
    const winFonts = [
      'C:/Windows/Fonts/impact.ttf',
      'C:/Windows/Fonts/arialbd.ttf',
      'C:/Windows/Fonts/arial.ttf',
    ];
    for (const fontPath of winFonts) {
      if (fs.existsSync(fontPath)) {
        return { fontfile: fontPath, fontname: '' };
      }
    }
    return { fontfile: '', fontname: 'Arial' };
  }

  // Fallback: let FFmpeg try its default
  return { fontfile: '', fontname: 'Arial' };
}
