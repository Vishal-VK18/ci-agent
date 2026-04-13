const express = require("express");
const router = express.Router();

const { callGroq } = require("../lib/groq");
const { writeSignal } = require("../lib/hindsight");
const { EXTRACT_SYSTEM, buildExtractionPrompt } = require("../prompts/extract");

const VALID_SIGNAL_TYPES = ["pricing", "feature", "hiring", "messaging", "pr", "review"];

// Map common free-text variants from LLM output → valid enum value
const TYPE_ALIASES = {
  "price":            "pricing",
  "price change":     "pricing",
  "pricing shift":    "pricing",
  "pricing update":   "pricing",
  "price reduction":  "pricing",
  "product update":   "feature",
  "product launch":   "feature",
  "product feature":  "feature",
  "new feature":      "feature",
  "launch":           "feature",
  "strategic hire":   "hiring",
  "hire":             "hiring",
  "talent":           "hiring",
  "recruitment":      "hiring",
  "market expansion": "pr",
  "expansion":        "pr",
  "partnership":      "pr",
  "press release":    "pr",
  "announcement":     "pr",
  "strategic investment": "pr",
  "investment":       "pr",
  "brand":            "messaging",
  "rebrand":          "messaging",
  "campaign":         "messaging",
  "positioning":      "messaging",
  "customer review":  "review",
  "rating":           "review",
  "feedback":         "review",
};

function normalizeSignalType(raw) {
  if (!raw) return null;
  const lower = String(raw).toLowerCase().trim();
  if (VALID_SIGNAL_TYPES.includes(lower)) return lower;
  return TYPE_ALIASES[lower] || null;
}

router.post("/", async (req, res) => {
  try {
    const { text, competitor_name } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Field 'text' is required and must be a non-empty string." });
    }

    const userPrompt = buildExtractionPrompt(text.trim(), competitor_name || null);
    const rawResponse = await callGroq(EXTRACT_SYSTEM, userPrompt);

    // Strip <think> blocks and markdown fences
    let cleanedJson = rawResponse.trim()
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    if (cleanedJson.startsWith("```")) {
      cleanedJson = cleanedJson
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
    }

    const jsonStart = cleanedJson.indexOf("{");
    const jsonEnd   = cleanedJson.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      return res.status(422).json({ error: "LLM did not return a JSON object.", raw: rawResponse });
    }
    cleanedJson = cleanedJson.slice(jsonStart, jsonEnd + 1);

    let signal;
    try {
      signal = JSON.parse(cleanedJson);
    } catch (parseErr) {
      return res.status(422).json({ error: "Failed to parse extracted signal as JSON.", raw: rawResponse });
    }

    // Validate competitor_name
    if (!signal.competitor_name || typeof signal.competitor_name !== "string") {
      return res.status(422).json({ error: "Extracted signal is missing 'competitor_name'." });
    }

    // Normalize signal_type — map aliases before rejecting
    const normalized = normalizeSignalType(signal.signal_type);
    if (!normalized) {
      return res.status(422).json({
        error: `Invalid signal_type '${signal.signal_type}'. Must be one of: ${VALID_SIGNAL_TYPES.join(", ")}.`,
      });
    }
    signal.signal_type = normalized;

    if (!signal.summary || typeof signal.summary !== "string") {
      return res.status(422).json({ error: "Extracted signal is missing 'summary'." });
    }

    signal.stored_at  = new Date().toISOString();
    signal.entities   = Array.isArray(signal.entities) ? signal.entities : [];
    signal.event_date = signal.event_date || null;

    const storeResult = await writeSignal(signal);

    return res.status(200).json({
      signal_id:  storeResult?.id || storeResult?.signal_id || null,
      summary:    signal.summary,
      signal_type: signal.signal_type,
      stored_at:  signal.stored_at,
    });
  } catch (err) {
    console.error("[Ingest] Unexpected error:", err.message || err);
    return res.status(500).json({ error: "Failed to ingest signal.", details: err.message });
  }
});

module.exports = router;
