const Groq = require("groq-sdk");

let groqClient = null;

/**
 * Lazily initialize and return the Groq client.
 * Reads GROQ_API_KEY from environment at call time, not at module load time.
 * @returns {Groq}
 */
function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
}

/**
 * Call Groq LLM with retry logic (exponential backoff).
 *
 * @param {string} systemPrompt - System-level instruction.
 * @param {string} userPrompt - User message content.
 * @param {number} retries - Number of retry attempts (default 3).
 * @returns {Promise<string>} - The response text from the model.
 */
async function callGroq(systemPrompt, userPrompt, retries = 3) {
  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const groq = getGroqClient();

      const response = await groq.chat.completions.create({
        model: "qwen/qwen3-32b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const text = response.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from Groq");

      return text.trim();
    } catch (err) {
      if (attempt < retries) {
        const delay = delays[attempt] || 4000;
        console.warn(
          `[Groq] Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`,
          err.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("[Groq] All retry attempts exhausted.");
        throw err;
      }
    }
  }
}

module.exports = { callGroq };
