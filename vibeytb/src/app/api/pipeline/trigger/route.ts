import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const token = process.env.GITHUB_PAT;
    if (!token) {
      return NextResponse.json({ error: 'GITHUB_PAT not configured' }, { status: 500 });
    }

    const owner = 'hoangnguyen1200';
    const repo = 'vibeytb';
    const workflow = 'daily-pipeline.yml';

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'master' }),
      }
    );

    if (res.status === 204) {
      return NextResponse.json({ success: true, message: 'Pipeline triggered successfully' });
    }

    const body = await res.text();
    return NextResponse.json(
      { error: `GitHub API responded with ${res.status}: ${body}` },
      { status: res.status }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
