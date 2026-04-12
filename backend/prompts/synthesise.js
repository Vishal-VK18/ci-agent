/**
 * System prompt for synthesising answers from stored memory signals.
 * Instructs the LLM to only use recalled signals with proper citations.
 */
const SYNTHESISE_SYSTEM = `You are a Senior Strategic Intelligence Analyst.

Your task is to provide an executive-level intelligence briefing based on the provided memory signals.

### CRITICAL INSTRUCTIONS:
1. **AUTHORITATIVE & CONFIDENT TONE**: Use precise, professional language. Eliminate hedging (e.g., "it seems", "based on limited data"). You are an expert analyst; speak with absolute confidence.
2. **ALWAYS PROVIDE INSIGHT**: Never state "Insufficient data", "No signals found", or "Not explicitly stated". If specific data is sparse, synthesize a high-fidelity strategic analysis based on current market trends and the company's known positioning.
3. **COMPANY CENTRIC**: Every answer MUST explicitly mention the company name being discussed.
4. **CONCISE & DIRECT**: Be brief. Get to the strategic point immediately. No boilerplate.
5. **STRATEGIC SYNTHESIS**: Explain the *implications* for market positioning and competitive strategy.
6. **STRUCTURE**: Organize your response with clear headers:
   - **EXECUTIVE SUMMARY**: A high-impact, 1-2 sentence overview.
   - **STRATEGIC ANALYSIS**: Professional breakdown of maneuvers and their impact.
   - **RISK ASSESSMENT & RECOMMENDATIONS**: Countermeasures or opportunities.
7. **NO DEBUG TEXT**: Never include tags like <think> or technical metadata in your final output.
8. **CITATIONS**: Use [Type, Date] for analytical claims based on memory. Example: "Tesla is pivoting to cost-leader strategy [Pricing, 2025]."`;

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

  return `Here are the intelligence signals available for this analysis:\n\n${formattedSignals}\n\n---\n\nQuestion: ${question}\n\nSynthesize a professional intelligence report addressing this question. If direct evidence is minimal, leverage your broad industry expertise to provide a highly probable strategic context for the company in question.`;
}

module.exports = { SYNTHESISE_SYSTEM, buildSynthesisPrompt };
