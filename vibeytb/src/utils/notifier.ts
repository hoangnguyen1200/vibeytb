/**
 * Send pipeline status notifications via Discord Webhook.
 * Set DISCORD_WEBHOOK_URL in .env to enable.
 * $0 cost — Discord webhooks are free.
 */

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface NotifyPayload {
  status: 'success' | 'failure';
  jobId: string;
  title?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  error?: string;
  durationMs?: number;
}

export async function notifyDiscord(payload: NotifyPayload): Promise<void> {
  if (!WEBHOOK_URL) {
    console.log('[NOTIFY] No DISCORD_WEBHOOK_URL set, skipping notification.');
    return;
  }

  const isSuccess = payload.status === 'success';
  const emoji = isSuccess ? '✅' : '❌';
  const color = isSuccess ? 0x00ff00 : 0xff0000;
  const durationStr = payload.durationMs
    ? `${(payload.durationMs / 1000 / 60).toFixed(1)} min`
    : 'N/A';

  const embed = {
    title: `${emoji} Pipeline ${isSuccess ? 'Success' : 'Failed'}`,
    color,
    fields: [
      { name: 'Job ID', value: `\`${payload.jobId}\``, inline: true },
      { name: 'Duration', value: durationStr, inline: true },
      ...(payload.title ? [{ name: 'Video Title', value: payload.title, inline: false }] : []),
      ...(payload.youtubeUrl ? [{ name: '🎬 YouTube', value: payload.youtubeUrl, inline: false }] : []),
      ...(payload.tiktokUrl ? [{ name: '🎵 TikTok', value: payload.tiktokUrl, inline: false }] : []),
      ...(payload.error ? [{ name: '🔥 Error', value: `\`\`\`${payload.error.slice(0, 500)}\`\`\``, inline: false }] : []),
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'VibeYtb Pipeline' },
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      console.warn(`[NOTIFY] Discord webhook failed: ${response.status}`);
    } else {
      console.log(`[NOTIFY] ${emoji} Discord notification sent.`);
    }
  } catch (err) {
    console.warn('[NOTIFY] Discord webhook error:', err);
  }
}
