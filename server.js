const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ~150 words per minute for natural TTS speech
const WORDS_PER_MINUTE = 150;

const SYSTEM_PROMPT = `You are a psychological rewiring engine that generates spoken audio content. Your output is listened to — not read. It operates on both the conscious and subconscious mind to move the listener toward whatever they've asked for.

RULES:
1. IDENTITY LANGUAGE — write in present tense second person. "You are" not "you will be." The listener already is this person — they're remembering it.
2. SUBCONSCIOUS EMBEDDING — use natural embedded commands: "notice how", "you already know", "as you continue building". Plant assumptions as facts.
3. REAL INSIGHT — give the rational mind something true and specific to hold. No platitudes. No clichés. No "believe in yourself" or "you got this."
4. EMOTIONAL TRUTH — each wave must earn one genuine emotional landing. Build to it. Don't manufacture it.
5. SPOKEN RHYTHM — short sentences. Natural pauses implied by punctuation. Written for ears, not eyes. No lists, no bullet points, no headers.
6. NEVER REPEAT — each wave covers completely different psychological territory. If you wrote about identity in wave 1, don't touch identity again in wave 2.
7. STAY SPECIFIC — reference what the person actually typed. Generic content is worthless.

Output ONLY a valid JSON array. No markdown, no backticks, no explanation before or after.
Each object has exactly two fields:
- "title": 3-5 word evocative chapter-style title
- "content": full wave text written for audio, natural spoken rhythm`;

app.post('/api/generate', async (req, res) => {
  const { prompt, minutes = 10 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Anthropic key not set' });

  // Calculate how many words we need total, then split into waves
  const totalWords = Math.round(minutes * WORDS_PER_MINUTE);
  const wordsPerWave = 400; // ~2.5 min per wave at natural pace
  const waveCount = Math.max(1, Math.round(totalWords / wordsPerWave));
  const actualWordsPerWave = Math.round(totalWords / waveCount);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `The listener wants: "${prompt}"

Generate exactly ${waveCount} waves.
Each wave must be approximately ${actualWordsPerWave} words — this controls audio duration.
Target total session length: ${minutes} minutes of spoken audio.

Write every wave specifically for what this person typed. Make it feel like you know them.`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',

      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const raw = message.content[0].text.replace(/```json|```/g, '').trim();
    const waves = JSON.parse(raw);
    res.json({ waves, waveCount, totalWords, minutes });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Generation failed', detail: err.message });
  }
});

app.post('/api/synthesize', async (req, res) => {
  const { text, voiceId = 'onwK4e9ZLuTAKqWW03F9' } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs key not set' });

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'ElevenLabs failed', detail: err });
    }

    const buf = await response.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    res.json({ audio: b64, mimeType: 'audio/mpeg' });
  } catch (err) {
    console.error('Synth error:', err);
    res.status(500).json({ error: 'Synthesis failed', detail: err.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SIGNAL API on port ${PORT}`));
