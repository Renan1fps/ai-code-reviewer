const DEFAULT_MODEL = 'gemini-1.5-pro';
async function review({ model, prompt }) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({ model: model || DEFAULT_MODEL });
  const result = await gemini.generateContent(prompt);
  return result.response.text();
}
module.exports = { review, DEFAULT_MODEL };
