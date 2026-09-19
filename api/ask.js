// /api/ask.js — Vercel serverless function.
// Runs server-side so the Anthropic API key never reaches the browser.
// Requires an ANTHROPIC_API_KEY environment variable set in the Vercel
// project (Settings → Environment Variables), NOT committed to the repo.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No key configured — the client falls back to its local canned
    // answers when it sees this, so the feature degrades gracefully
    // rather than breaking for anyone testing before the key is set.
    res.status(503).json({ error: 'AI not configured' });
    return;
  }

  const { story, question } = req.body || {};
  if (!story || !question || typeof question !== 'string') {
    res.status(400).json({ error: 'Missing story or question' });
    return;
  }

  // Keep the prompt strictly grounded in the story's own fields — no
  // open-ended chat, no answering things outside this specific story.
  const prompt = `You are simplify's AI tutor. Answer the question below about ONE specific news story, grounded only in the story details given — never outside general knowledge, never invented facts. Keep the answer under 90 words, plain language, no unexplained jargon. If the question can't be answered from this story, say so plainly.

Story details:
Headline: ${story.headline || ''}
What happened: ${story.whatHappened || ''}
Why it happened: ${story.why || ''}
Why it matters: ${story.matters || ''}
Who's affected: ${(story.affected || []).join(', ')}
What's next: ${story.next || ''}
Key concepts: ${(story.concepts || []).join(', ')}

Question: ${question.slice(0, 500)}`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 220,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Upstream error', detail: detail.slice(0, 300) });
      return;
    }

    const data = await upstream.json();
    const text = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      res.status(502).json({ error: 'Empty response' });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
}
