import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Thin proxy to Neon AI Gateway (OpenAI-compatible). Kept server-side so the
// gateway token is never exposed to the browser.
export async function POST(req: NextRequest) {
  const { prompt, model = 'claude-haiku-4-5' } = (await req.json()) as {
    prompt?: string;
    model?: string;
  };
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  const res = await fetch(`${process.env.NEON_AI_GATEWAY_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.NEON_AI_GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ status: res.status, upstream: text }, { status: res.status });
  }
  return new NextResponse(text, { headers: { 'Content-Type': 'application/json' } });
}
