/**
 * System prompt for synthesising answers from stored memory signals.
 * Instructs the LLM to only use recalled signals with proper citations.
 */
const SYNTHESISE_SYSTEM = `You are a competitive intelligence analyst.

Your job is to answer the user's question based ONLY on the competitive signals stored in memory that are provided to you. Do NOT use external knowledge or assumptions.

For every claim you make, include a citation in the format: [signal_type, date]
Example: "Competitor X raised prices in Q1 [pricing, 2024-01-15]."

Rules:
- Answer using ONLY the signals provided below.
- If the signals do not contain enough information to answer the question, say: "Insufficient data in memory to answer this question."
- Do not fabricate information.
- Keep your answer concise and professional.
- Always include at least one citation per claim.`;

/**
 * Build the user-facing synthesis prompt with recalled signals injected.
 * @param {Object[]} signals - Array of recalled signal objects from Hindsight.
 * @param {string} question - The user's question.
 * @returns {string} - Formatted prompt with signals and question.
 */
function buildSynthesisPrompt(signals, question) {
  const formattedSignals = signals
    .map((s, i) => {
      const content = s.content || s.text || JSON.stringify(s);
      const meta = s.metadata || {};
      const date = meta.event_date || meta.stored_at || "unknown date";
      const type = meta.signal_type || "unknown";
      return `Signal ${i + 1} [${type}, ${date}]: ${content}`;
    })
    .join("\n\n");

  return `Here are the memory signals available:\n\n${formattedSignals}\n\n---\n\nQuestion: ${question}`;
}

module.exports = { SYNTHESISE_SYSTEM, buildSynthesisPrompt };
