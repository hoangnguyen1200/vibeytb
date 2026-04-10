import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Best AI Tools 2026 — Curated by TechHustleLabs',
  description:
    'Hand-picked AI tools for productivity, content creation, and automation. Reviewed and recommended by TechHustleLabs on YouTube.',
  openGraph: {
    title: 'Best AI Tools 2026 — TechHustleLabs',
    description: 'Curated collection of the best AI tools, reviewed on YouTube Shorts.',
    type: 'website',
  },
};

interface PublicTool {
  name: string;
  slug: string;
  url: string;
  commission: string;
  description: string;
}

async function getPublicTools(): Promise<PublicTool[]> {
  try {
    // Server component — query Supabase directly (no internal fetch needed)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase
      .from('affiliate_links')
      .select('tool_name, direct_url, commission, notes, affiliate_url')
      .eq('active', true)
      .order('tool_name', { ascending: true });

    if (error) throw error;

    return (data ?? [])
      .filter(t => t.affiliate_url && t.affiliate_url.trim() !== '')
      .map(t => ({
        name: t.tool_name,
        slug: t.tool_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        url: t.direct_url || '',
        commission: t.commission || '',
        description: t.notes || '',
      }));
  } catch {
    return [];
  }
}

export default async function ToolsPage() {
  const tools = await getPublicTools();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    }}>
      {/* Hero Header */}
      <header style={{
        textAlign: 'center',
        padding: '60px 20px 40px',
        background: 'linear-gradient(180deg, rgba(139,92,246,0.08) 0%, transparent 100%)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          borderRadius: 20,
          background: 'var(--accent-subtle)',
          border: '1px solid var(--border-accent)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--accent)',
          marginBottom: 20,
        }}>
          ⚡ TechHustleLabs
        </div>

        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 44px)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1.15,
          margin: '0 auto',
          maxWidth: 600,
        }}>
          AI Tools I Actually <br />
          <span style={{
            background: 'linear-gradient(135deg, var(--accent), #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Use & Recommend
          </span>
        </h1>

        <p style={{
          fontSize: 16,
          color: 'var(--text-secondary)',
          marginTop: 16,
          maxWidth: 480,
          margin: '16px auto 0',
          lineHeight: 1.5,
        }}>
          Every tool here has been reviewed on my YouTube channel.
          Try them out — some links support our channel at no extra cost to you.
        </p>

        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          marginTop: 24,
          flexWrap: 'wrap',
        }}>
          <a
            href="https://youtube.com/@TechHustleLabs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 'var(--radius-sm)',
              background: '#ff0000',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              transition: 'opacity 0.2s',
            }}
          >
            ▶ YouTube Channel
          </a>
          <a
            href="https://linktr.ee/techhustlelabs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              border: '1px solid var(--border-default)',
              transition: 'background 0.2s',
            }}
          >
            🔗 All Links
          </a>
        </div>
      </header>

      {/* Tools Grid */}
      <main style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '40px 20px 60px',
      }}>
        {tools.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Tools coming soon
            </h2>
            <p style={{ fontSize: 14 }}>
              We&apos;re curating the best AI tools. Check back soon!
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 24,
            }}>
              <h2 style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>
                {tools.length} Recommended Tool{tools.length !== 1 ? 's' : ''}
              </h2>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}>
              {tools.map((tool) => (
                <ToolCard key={tool.slug} tool={tool} />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '32px 20px',
        borderTop: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
        fontSize: 12,
        lineHeight: 1.6,
      }}>
        <p style={{ maxWidth: 500, margin: '0 auto' }}>
          Some links on this page are affiliate links — we may earn a small commission
          at no extra cost to you. This helps support our channel and free content.
        </p>
        <p style={{ marginTop: 12 }}>
          © {new Date().getFullYear()} TechHustleLabs • Built with ⚡ VibeYtb
        </p>
      </footer>
    </div>
  );
}

function ToolCard({ tool }: { tool: PublicTool }) {
  // Extract domain for display
  let displayDomain = '';
  try {
    displayDomain = new URL(tool.url).hostname.replace('www.', '');
  } catch {
    displayDomain = tool.url;
  }

  return (
    <article style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)',
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      transition: 'border-color 0.2s, box-shadow 0.2s',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Accent top bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'linear-gradient(90deg, var(--accent), #ec4899)',
      }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <h3 style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            {tool.name}
          </h3>
          <span style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            marginTop: 2,
            display: 'block',
          }}>
            {displayDomain}
          </span>
        </div>

        {tool.commission && (
          <span style={{
            flexShrink: 0,
            padding: '4px 10px',
            borderRadius: 12,
            background: 'rgba(34, 197, 94, 0.12)',
            color: 'var(--status-success)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>
            💰 {tool.commission}
          </span>
        )}
      </div>

      {/* Description */}
      {tool.description && (
        <p style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          margin: 0,
          flex: 1,
        }}>
          {tool.description}
        </p>
      )}

      {/* CTA */}
      <a
        href={`/go/${tool.slug}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 20px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--accent)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 14,
          textDecoration: 'none',
          transition: 'background 0.2s, box-shadow 0.2s',
          marginTop: 'auto',
        }}
      >
        Try {tool.name} →
      </a>
    </article>
  );
}
