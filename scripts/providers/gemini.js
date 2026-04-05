const DEFAULT_MODEL = 'gemini-3-flash-preview';

async function review({ model, prompt }) {
  const { GoogleGenAI  } = require('@google/genai');
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await genAI.models.generateContent({
    model: model || DEFAULT_MODEL,
    contents: prompt
  });

  return response.text;
}

module.exports = { review, DEFAULT_MODEL };