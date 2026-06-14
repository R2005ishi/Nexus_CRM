import { Router, Request, Response } from 'express';

const router = Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODELS = [
  { name: 'llama-3.3-70b-versatile' },
  { name: 'llama-3.1-8b-instant' },
  { name: 'mixtral-8x7b-32768' },
  { name: 'gemma2-9b-it' }
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/ai/models
// Returns the list of available Groq models.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/models', async (_req: Request, res: Response): Promise<void> => {
  res.json({
    provider: 'groq',
    models: GROQ_MODELS
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/chat
// Streams the Groq AI chat completion back to the browser.
// Body: { model, messages, stream? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const { model, messages, stream = true } = req.body;

  if (!model || !messages) {
    res.status(400).json({ error: 'model and messages are required' });
    return;
  }

  if (!GROQ_API_KEY || GROQ_API_KEY.trim() === '' || GROQ_API_KEY === 'gsk_...') {
    res.status(500).json({ error: 'Groq API Key is not configured on the backend. Please add GROQ_API_KEY to your .env file.' });
    return;
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream
      })
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(502).json({ error: `Groq error ${response.status}`, detail: text });
      return;
    }

    if (!stream) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      res.json({
        message: {
          role: 'assistant',
          content
        }
      });
      return;
    }

    // Set up streaming headers so the browser gets NDJSON as it arrives
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = response.body?.getReader();
    if (!reader) {
      res.status(502).json({ error: 'No response body from Groq' });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.slice(6);
            const json = JSON.parse(jsonStr);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              // Return formatted as Ollama-compatible NDJSON
              res.write(JSON.stringify({
                message: {
                  role: 'assistant',
                  content
                }
              }) + '\n');
            }
          } catch (e) {
            // Ignore partial parsing errors
          }
        }
      }
      return pump();
    };

    req.on('close', () => reader.cancel());
    await pump();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Groq is not reachable', detail: err?.message });
    } else {
      res.end();
    }
  }
});

export default router;
