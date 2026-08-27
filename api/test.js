module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      status: "error",
      message: "GEMINI_API_KEY environment variable is not set on Vercel."
    });
  }

  // Ultra-robust API Key extractor: find the actual Google API key starting with AIzaSy
  const keyMatch = apiKey.match(/AIzaSy[A-Za-z0-9_-]+/);
  const cleanApiKey = keyMatch ? keyMatch[0] : apiKey.trim().replace(/^["']|["']$/g, '');

  const urlParts = req.url.split('?');
  const urlParams = new URLSearchParams(urlParts.length > 1 ? urlParts[1] : '');
  const modelName = urlParams.get('model') || 'gemini-3.6-flash';

  try {
    const startTime = Date.now();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanApiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hello! Respond with short OK." }] }]
      })
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      return res.status(200).json({
        status: "success",
        model: modelName,
        latencyMs: latency,
        message: `Proxy connected to ${modelName} successfully!`
      });
    } else {
      const errorText = await response.text();
      return res.status(400).json({
        status: "error",
        model: modelName,
        latencyMs: latency,
        message: `Gemini API returned error: ${errorText}`
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: `Proxy failed to connect to Gemini: ${error.message}`
    });
  }
};
