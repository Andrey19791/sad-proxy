module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Robust Body Parser
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.error('Failed to parse body as string:', e);
    }
  } else if (!body || Object.keys(body).length === 0) {
    try {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const rawBody = Buffer.concat(buffers).toString();
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error('Failed to read and parse body from stream:', e);
    }
  }

  const { imageBase64, imagesBase64, mimeType, language } = body || {};
  const targetLanguage = language || 'Ukrainian';

  if ((!imageBase64 && (!imagesBase64 || !Array.isArray(imagesBase64) || imagesBase64.length === 0)) || !mimeType) {
    return res.status(400).json({ error: 'Missing imageBase64 or imagesBase64 or mimeType' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server error: GEMINI_API_KEY environment variable is not set on Vercel.' });
  }

  // Clean the API Key (remove quotes, spaces, newlines)
  const cleanApiKey = apiKey.trim().replace(/^["']|["']$/g, '');

  try {
    // Switched to gemini-3.6-flash (required for new API keys under Google's deprecation rules)
    const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

    const parts = [
      {
        text: `Analyze these plant images (which may include a photo of the whole plant, a close-up of a leaf, and a close-up of a stem/flower). Identify the most likely plant species, calculate recognition probabilities, analyze plant health state (choose between: 'healthy', 'warning', 'danger'), outline noticed symptoms, configure quick care parameters, provide a concrete immediate task to do today, and supply detailed descriptions for tabs. Respond in ${targetLanguage} language. You MUST return ONLY a valid JSON object matching the following structure (do not wrap in markdown tags like \`\`\`json, do not write other explanation, do not write any pre-amble or post-amble):
{
  "plantName": "Plant name in ${targetLanguage} (e.g. Monstera Deliciosa)",
  "species": "Botanical name in Latin (e.g. Monstera deliciosa)",
  "probabilities": [
    { "name": "Monstera deliciosa", "percentage": 94 },
    { "name": "Monstera adansonii", "percentage": 4 },
    { "name": "Other", "percentage": 2 }
  ],
  "healthStatus": "Short health status description in ${targetLanguage}",
  "healthStatusType": "One of: healthy, warning, danger",
  "primaryIssue": "Primary diagnosed issue and confidence in ${targetLanguage}",
  "symptoms": [
    "symptom 1 in ${targetLanguage}",
    "symptom 2 in ${targetLanguage}"
  ],
  "quickCare": {
    "light": "Light requirement in ${targetLanguage}",
    "watering": "Watering requirement in ${targetLanguage}",
    "temperature": "Temperature range (e.g. 18–28°C)",
    "humidity": "Humidity range (e.g. 50–70%)",
    "difficulty": "Care difficulty in ${targetLanguage}"
  },
  "todayTask": "Immediate care recommendation for today in ${targetLanguage}",
  "confidence": 92,
  "diagnosis": "Analysis of symptoms and possible causes in ${targetLanguage}",
  "watering": "Watering advice in ${targetLanguage}",
  "lighting": "Lighting advice in ${targetLanguage}",
  "temperature": "Temperature advice in ${targetLanguage}",
  "soil": "Soil advice in ${targetLanguage}",
  "fertilizers": "Fertilizer advice in ${targetLanguage}",
  "tabCare": "Detailed care tab content in ${targetLanguage} (remind the user to guide on soil moisture, not strict calendar)",
  "tabDiseases": "Detailed disease tab content in ${targetLanguage}",
  "tabWatering": "Detailed watering tab content in ${targetLanguage}",
  "tabLighting": "Detailed lighting tab content in ${targetLanguage}",
  "tabSoil": "Detailed soil tab content in ${targetLanguage}",
  "tabFertilizers": "Detailed fertilizers tab content in ${targetLanguage}"
}`
      }
    ];

    if (imagesBase64 && Array.isArray(imagesBase64)) {
      imagesBase64.forEach(img => {
        if (img) {
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: img
            }
          });
        }
      });
    } else if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: imageBase64
        }
      });
    }

    const requestBody = {
      contents: [
        {
          parts: parts
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanApiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Gemini API error: ${errorText}` });
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return res.status(500).json({ error: 'Empty response from Gemini API' });
    }

    // Clean JSON response
    let cleanText = textResponse.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.substring(7);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    cleanText = cleanText.trim();

    // Parse to ensure it is valid JSON
    const parsedJson = JSON.parse(cleanText);

    return res.status(200).json(parsedJson);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: `Proxy internal error: ${error.message}` });
  }
};
