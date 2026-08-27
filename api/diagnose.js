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

  const { imageBase64, imagesBase64, mimeType } = body || {};

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
        text: "Analyze these plant images (which may include a photo of the whole plant, a close-up of a leaf, and a close-up of a stem/flower). Identify the most likely plant species, determine the plant's health status, and calculate the identification probability percentage for the top candidates. Respond in Ukrainian language. You MUST return ONLY a valid JSON object matching the following structure (do not wrap in markdown tags like ```json, do not write other explanation, do not write any pre-amble or post-amble):\n{\n  \"plantName\": \"Назва найбільш ймовірної рослини українською (наприклад, Монстера Деліціоза)\",\n  \"species\": \"Ботанічна назва латиною (наприклад, Monstera deliciosa)\",\n  \"probabilities\": [\n    { \"name\": \"Monstera deliciosa\", \"percentage\": 94 },\n    { \"name\": \"Monstera adansonii\", \"percentage\": 4 },\n    { \"name\": \"Інше\", \"percentage\": 2 }\n  ],\n  \"healthStatus\": \"Статус здоров'я (наприклад: Пожовтіння листя, Всихання кінчиків, Здорова рослина тощо)\",\n  \"confidence\": 92,\n  \"diagnosis\": \"Аналіз симптомів та можливих причин чому так відбувається\",\n  \"watering\": \"Рекомендації щодо поливу у такому стані\",\n  \"lighting\": \"Рекомендації щодо освітлення\",\n  \"temperature\": \"Рекомендації щодо температурного режиму та вентиляції\",\n  \"soil\": \"Рекомендації щодо структури ґрунту або пересадки\",\n  \"fertilizers\": \"Рекомендації щодо внесення мікроелементів чи добрив\"\n}"
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
