/**
 * System prompt for structured signal extraction from raw text.
 * Instructs the LLM to output ONLY valid JSON.
 */
const EXTRACT_SYSTEM = `You are a competitive intelligence extraction engine.

Your job is to extract structured competitive signals from raw text provided by the user.

You MUST respond with ONLY a valid JSON object — no explanation, no markdown, no code fences.

The JSON must contain exactly these fields:
{
  "competitor_name": "string — name of the competitor company or product",
  "signal_type": "one of: pricing | feature | hiring | messaging | pr | review",
  "event_date": "string — ISO date (YYYY-MM-DD) if mentioned, otherwise null",
  "summary": "string — 1 sentence, max 30 words describing the signal",
  "entities": ["array", "of", "relevant", "named", "entities", "from", "the", "text"]
}

Rules:
- Output ONLY the JSON. No explanation. No preamble. No trailing text.
- If a field cannot be determined, use null for strings and [] for arrays.
- signal_type must be exactly one of: pricing, feature, hiring, messaging, pr, review.
- summary must be a maximum of 30 words and one sentence.`;

/**
 * Build the user prompt for signal extraction.
 * @param {string} text - Raw text to extract a signal from.
 * @param {string|null} competitorName - Optional competitor name hint.
 * @returns {string} - Formatted user prompt.
 */
function buildExtractionPrompt(text, competitorName = null) {
  let prompt = `Extract a competitive intelligence signal from the following text:\n\n"${text}"`;
  if (competitorName) {
    prompt += `\n\nHint: The competitor involved is likely "${competitorName}".`;
  }
  return prompt;
}

module.exports = { EXTRACT_SYSTEM, buildExtractionPrompt };
