/**
 * Keywords that indicate a pattern/trend analysis query.
 */
const PATTERN_KEYWORDS = [
  "pattern",
  "trend",
  "always",
  "usually",
  "predict",
  "before",
  "after",
  "typically",
];

/**
 * System prompt for pattern detection across multiple signals.
 * Instructs the LLM to identify recurring patterns, leading indicators, and predictions.
 */
const PATTERN_SYSTEM = `You are a competitive intelligence pattern analyst.

Your job is to analyze a set of competitive signals and identify patterns, trends, and predictions.

For each pattern found, format your output exactly as follows:

PATTERN FOUND: [describe the recurring pattern or trend]
EVIDENCE: [list the specific signals that support this pattern]
PREDICTION: [what this pattern suggests will happen next]

Rules:
- Identify ALL distinct patterns or strategic clusters present in the signals.
- Each pattern block must follow the exact format above.
- Use only the provided signals for specific evidence.
- Be analytical, precise, and actionable.
- If no clear granular patterns are found, identify broader strategic movements at the competitor or market level.
- Never say "No significant patterns detected"; instead, provide a professional categorical overview.`;

/**
 * Build the pattern analysis prompt from recalled signals.
 * @param {Object[]} signals - Array of recalled signal objects from Hindsight.
 * @param {string} question - The user's original question.
 * @returns {string} - Formatted prompt for pattern analysis.
 */
function buildPatternPrompt(signals, question) {
  const formattedSignals = signals
    .map((s, i) => {
      const content = s.content || s.text || JSON.stringify(s);
      const meta = s.metadata || {};
      const date = meta.event_date || meta.stored_at || "unknown date";
      const type = meta.signal_type || "unknown";
      const competitor = meta.competitor_name || "Unknown Competitor";
      return `Signal ${i + 1} | Competitor: ${competitor} | Type: ${type} | Date: ${date}\n${content}`;
    })
    .join("\n\n");

  return `Analyze the following competitive signals for patterns, trends, and leading indicators:\n\n${formattedSignals}\n\n---\n\nUser Question: ${question}`;
}

/**
 * Detect whether a user query is asking for pattern/trend analysis.
 * @param {string} question - The user's query string.
 * @returns {boolean} - True if the query matches pattern keywords.
 */
function isPatternQuery(question) {
  if (!question || typeof question !== "string") return false;
  const lower = question.toLowerCase();
  return PATTERN_KEYWORDS.some((keyword) => lower.includes(keyword));
}

module.exports = { PATTERN_SYSTEM, buildPatternPrompt, isPatternQuery, PATTERN_KEYWORDS };
