const DEFAULT_MODEL = 'gpt-4o';
async function review({ model, prompt }) {
  const OpenAI = require('scripts/providers/openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: model || DEFAULT_MODEL, max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}
module.exports = { review, DEFAULT_MODEL };
