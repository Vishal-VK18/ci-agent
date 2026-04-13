const PATTERN_KEYWORDS = ["pattern", "trend", "always", "usually", "predict", "before", "after", "typically", "recurring", "history", "over time"];

const PATTERN_SYSTEM = `You are a competitive intelligence pattern analyst.

Analyze signals across ALL competitors and identify the strongest recurring pattern.

Format (use these exact labels):
PATTERN: describe the recurring behavior observed across competitors.
EVIDENCE: cite 2–3 specific signals with competitor name and date.
PREDICTION: what will likely happen in the next 60–90 days based on this pattern.

Rules:
- Total answer under 150 words.
- Be specific — name competitors and dates.
- Never include debug text or <think> tags.`;

function buildPatternPrompt(signals, question) {
  // Use all signals passed in (caller already capped at RECALL_LIMIT)
  const formattedSignals = signals
    .map((s, i) => {
      const content    = (s.content || s.text || JSON.stringify(s)).slice(0, 130);
      const meta       = s.metadata || {};
      const date       = meta.event_date || meta.stored_at || "unknown date";
      const type       = meta.signal_type || "unknown";
      const competitor = meta.competitor_name || "Unknown";
      return `Signal ${i + 1} | ${competitor} | ${type} | ${date}\n${content}`;
    })
    .join("\n\n");

  return `Signals:\n${formattedSignals}\n\nQuestion: ${question}\n\nIdentify the strongest pattern across these competitors.`;
}

function isPatternQuery(question) {
  if (!question || typeof question !== "string") return false;
  const lower = question.toLowerCase();
  return PATTERN_KEYWORDS.some((kw) => lower.includes(kw));
}

module.exports = { PATTERN_SYSTEM, buildPatternPrompt, isPatternQuery, PATTERN_KEYWORDS };
