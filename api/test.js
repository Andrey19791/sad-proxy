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

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`;
    const response = await fetch(geminiUrl);

    if (response.ok) {
      const data = await response.json();
      const modelNames = data.models ? data.models.map(m => m.name) : [];
      return res.status(200).json({
        status: "success",
        models: modelNames
      });
    } else {
      const errorText = await response.text();
      return res.status(400).json({
        status: "error",
        message: `Failed to list models: ${errorText}`
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: `Proxy failed to connect to Gemini: ${error.message}`
    });
  }
};
