/**
 * Send pipeline status notifications via Discord Webhook.
 * Set DISCORD_WEBHOOK_URL in .env to enable.
 * $0 cost — Discord webhooks are free.
 */
import { DISCORD_FOOTER, DISCORD_DIGEST_FOOTER } from './branding';

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
    footer: { text: DISCORD_FOOTER },
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

/**
 * Send a daily digest summary to Discord after pipeline completes.
 * Includes: today's result, yesterday's video performance, 7-day stats.
 */
export async function notifyDailyDigest(opts: {
  todayStatus: 'success' | 'failure';
  todayTitle?: string;
  todayTool?: string;
  todayDurationMs?: number;
  yesterdayViews?: number;
  yesterdayLikes?: number;
  weekAvgViews?: number;
  weekBestTitle?: string;
  weekBestViews?: number;
  successRate7d?: number;
}): Promise<void> {
  if (!WEBHOOK_URL) return;

  const isSuccess = opts.todayStatus === 'success';
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const fields = [
    {
      name: isSuccess ? '✅ Today' : '❌ Today',
      value: isSuccess
        ? `Published: "${opts.todayTitle ?? 'N/A'}" (${opts.todayTool ?? ''})`
        : 'Pipeline failed — check logs',
      inline: false,
    },
    ...(opts.yesterdayViews != null ? [{
      name: '📈 Yesterday',
      value: `${opts.yesterdayViews.toLocaleString()} views, ${(opts.yesterdayLikes ?? 0).toLocaleString()} likes`,
      inline: true,
    }] : []),
    ...(opts.weekAvgViews != null ? [{
      name: '📊 7-day avg',
      value: `${opts.weekAvgViews.toLocaleString()} views/day`,
      inline: true,
    }] : []),
    ...(opts.weekBestTitle ? [{
      name: '🏆 Best this week',
      value: `"${opts.weekBestTitle}" (${(opts.weekBestViews ?? 0).toLocaleString()} views)`,
      inline: false,
    }] : []),
    ...(opts.successRate7d != null ? [{
      name: '⚡ Success rate',
      value: `${opts.successRate7d}%${opts.successRate7d < 60 ? ' → Needs improvement' : ' ✅'}`,
      inline: true,
    }] : []),
  ];

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `📊 Daily Report — ${date}`,
          color: isSuccess ? 0x22c55e : 0xef4444,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: DISCORD_DIGEST_FOOTER },
        }],
      }),
    });
    console.log('[NOTIFY] 📊 Daily digest sent.');
  } catch (err) {
    console.warn('[NOTIFY] Daily digest error:', err);
  }
}
