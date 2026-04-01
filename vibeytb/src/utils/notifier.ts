/**
 * Send pipeline status notifications via Discord Webhook.
 * Set DISCORD_WEBHOOK_URL in .env to enable.
 * $0 cost — Discord webhooks are free.
 */

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface NotifyPayload {
  status: 'success' | 'failure' | 'warning';
  jobId: string;
  title?: string;
  toolName?: string;
  websiteUrl?: string;
  dataSource?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  durationMs?: number;
}

export async function notifyDiscord(payload: NotifyPayload): Promise<void> {
  if (!WEBHOOK_URL) {
    console.log('[NOTIFY] No DISCORD_WEBHOOK_URL set, skipping notification.');
    return;
  }

  const isSuccess = payload.status === 'success';
  const isWarning = payload.status === 'warning';
  const emoji = isSuccess ? '✅' : isWarning ? '⚠️' : '❌';
  const color = isSuccess ? 0x00ff00 : isWarning ? 0xffaa00 : 0xff0000;
  const statusLabel = isSuccess ? 'Success' : isWarning ? 'Warning' : 'Failed';
  const durationStr = payload.durationMs
    ? `${(payload.durationMs / 1000 / 60).toFixed(1)} min`
    : 'N/A';

  const fields = [
    { name: 'Job ID', value: `\`${payload.jobId}\``, inline: true },
    { name: 'Duration', value: durationStr, inline: true },
    ...(payload.dataSource ? [{ name: 'Source', value: `\`${payload.dataSource}\``, inline: true }] : []),
    ...(payload.toolName ? [{ name: '🛠️ Tool', value: payload.toolName, inline: true }] : []),
    ...(payload.websiteUrl ? [{ name: '🌐 Website', value: payload.websiteUrl, inline: true }] : []),
    ...(payload.title ? [{ name: '📝 Video Title', value: payload.title, inline: false }] : []),
    ...(payload.youtubeUrl ? [{ name: '🎬 YouTube', value: `[Watch on YouTube](${payload.youtubeUrl})`, inline: true }] : []),
    ...(payload.tiktokUrl ? [{ name: '🎵 TikTok', value: `[Watch on TikTok](${payload.tiktokUrl})`, inline: true }] : []),
    ...(payload.error ? [{ name: '🔥 Error', value: `\`\`\`${payload.error.slice(0, 500)}\`\`\``, inline: false }] : []),
  ];

  const embed: Record<string, unknown> = {
    title: `${emoji} Pipeline ${statusLabel}`,
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'VibeYtb Pipeline • @TechHustleLabs' },
  };

  // Embed YouTube thumbnail as image if available
  if (payload.thumbnailUrl) {
    embed.image = { url: payload.thumbnailUrl };
  }

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
