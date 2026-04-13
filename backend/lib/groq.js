const Groq = require("groq-sdk");

let groqClient = null;
const FAST_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const DEFAULT_OPTIONS = {
  model:                FAST_MODEL,
  temperature:          0.1,
  max_completion_tokens: 280,
};

function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} [overrides] - Optional completion option overrides (e.g. { max_completion_tokens: 400 })
 * @param {number} [retries=1]
 */
async function callGroq(systemPrompt, userPrompt, overrides = {}, retries = 1) {
  // Support legacy callGroq(system, user, retryNumber) signature
  if (typeof overrides === "number") {
    retries  = overrides;
    overrides = {};
  }

  const options = { ...DEFAULT_OPTIONS, ...overrides };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const groq       = getGroqClient();
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), 10000);

      let response;
      try {
        response = await groq.chat.completions.create(
          {
            ...options,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: userPrompt },
            ],
          },
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(timer);
      }

      const raw = response.choices?.[0]?.message?.content;
      if (!raw) throw new Error("Empty response from Groq");

      const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!text) throw new Error("Response was empty after stripping think blocks");

      return text;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[Groq] Attempt ${attempt + 1} failed. Retrying...`, err.message);
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        console.error("[Groq] All retry attempts exhausted.");
        throw err;
      }
    }
  }
}

async function streamGroq(systemPrompt, userPrompt) {
  const groq = getGroqClient();
  const stream = await groq.chat.completions.create({
    ...DEFAULT_OPTIONS,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  });
  return stream;
}

module.exports = { callGroq, streamGroq, getGroqClient };
