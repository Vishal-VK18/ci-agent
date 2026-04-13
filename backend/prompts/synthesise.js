const SYNTHESISE_SYSTEM = `You are a senior competitive intelligence analyst.

Produce a structured intelligence brief. Use only the supplied signals.

Format your answer with exactly these 4 sections (one line each, no bullet nesting):
SUMMARY: one sentence overview of the competitive situation.
KEY MOVES: the 2–3 most significant competitor actions observed.
STRATEGIC IMPACT: what this means for the market in the next 30–90 days.
RECOMMENDATION: one concrete action the reader should take now.

Rules:
- Total answer must be under 160 words.
- Cite signal type and date inline like [pricing, 2024-11].
- Never include debug text or <think> tags.
- If signals span multiple types, address each type briefly.`;

/**
 * Build synthesis prompt with signals grouped by cluster type.
 * @param {Object[]} signals - Clustered, recency-sorted signals (max ~10).
 * @param {string[]} clusterTypes - Signal type labels present in this batch.
 * @param {string}   question
 */
function buildSynthesisPrompt(signals, clusterTypes = [], question) {
  // Group signals by type for the prompt so the LLM sees clear categories
  const byType = {};
  for (const s of signals) {
    const type = s.metadata?.signal_type || "general";
    if (!byType[type]) byType[type] = [];
    byType[type].push(s);
  }

  const sections = Object.entries(byType).map(([type, group]) => {
    const lines = group.map((s, i) => {
      const content = (s.content || s.text || JSON.stringify(s)).slice(0, 130);
      const meta = s.metadata || {};
      const date = meta.event_date || meta.stored_at || "unknown";
      const competitor = meta.competitor_name || "Unknown";
      return `  ${i + 1}. [${competitor}, ${date}] ${content}`;
    }).join("\n");
    return `[${type.toUpperCase()}]\n${lines}`;
  }).join("\n\n");

  const clusterNote = clusterTypes.length > 1
    ? `Signals span ${clusterTypes.length} intelligence categories: ${clusterTypes.join(", ")}.`
    : "";

  return `${clusterNote ? clusterNote + "\n\n" : ""}Signals:\n${sections}\n\nQuestion: ${question}\n\nWrite the 4-section intelligence brief now.`;
}

module.exports = { SYNTHESISE_SYSTEM, buildSynthesisPrompt };
