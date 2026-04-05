const DEFAULT_MODEL = 'claude-opus-4-5';
async function review({ model, prompt }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: model || DEFAULT_MODEL, max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].text;
}
module.exports = { review, DEFAULT_MODEL };
