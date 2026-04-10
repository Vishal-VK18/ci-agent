const express = require("express");
const router = express.Router();

const { callGroq } = require("../lib/groq");
const { writeSignal } = require("../lib/hindsight");
const { EXTRACT_SYSTEM, buildExtractionPrompt } = require("../prompts/extract");

/**
 * POST /ingest
 * Ingest raw text, extract a structured signal via Groq, and store it in Hindsight.
 *
 * Body:
 *   text {string} (required) - Raw text to extract signal from.
 *   competitor_name {string} (optional) - Hint for extraction.
 *
 * Response:
 *   { signal_id, summary, stored_at }
 */
router.post("/", async (req, res) => {
  try {
    const { text, competitor_name } = req.body;

    // Input validation
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Field 'text' is required and must be a non-empty string." });
    }

    // Step 1: Build and call extraction prompt
    const userPrompt = buildExtractionPrompt(text.trim(), competitor_name || null);
    const rawResponse = await callGroq(EXTRACT_SYSTEM, userPrompt);

    // Step 2: Clean JSON — strip code fences if present
    let cleanedJson = rawResponse.trim();
    if (cleanedJson.startsWith("```")) {
      cleanedJson = cleanedJson
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
    }

    // Step 3: Parse JSON safely
    let signal;
    try {
      signal = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error("[Ingest] JSON parse error:", parseErr.message);
      console.error("[Ingest] Raw response:", rawResponse);
      return res.status(422).json({
        error: "Failed to parse extracted signal as JSON.",
        raw: rawResponse,
      });
    }

    // Step 4: Validate required fields
    const VALID_SIGNAL_TYPES = ["pricing", "feature", "hiring", "messaging", "pr", "review"];

    if (!signal.competitor_name || typeof signal.competitor_name !== "string") {
      return res.status(422).json({ error: "Extracted signal is missing 'competitor_name'." });
    }
    if (!signal.signal_type || !VALID_SIGNAL_TYPES.includes(signal.signal_type)) {
      return res.status(422).json({
        error: `Extracted signal has invalid 'signal_type'. Must be one of: ${VALID_SIGNAL_TYPES.join(", ")}.`,
      });
    }
    if (!signal.summary || typeof signal.summary !== "string") {
      return res.status(422).json({ error: "Extracted signal is missing 'summary'." });
    }

    // Step 5: Add timestamp
    signal.stored_at = new Date().toISOString();
    signal.entities = Array.isArray(signal.entities) ? signal.entities : [];
    signal.event_date = signal.event_date || null;

    // Step 6: Store in Hindsight
    const storeResult = await writeSignal(signal);

    // Return structured response
    return res.status(200).json({
      signal_id: storeResult?.id || storeResult?.signal_id || null,
      summary: signal.summary,
      stored_at: signal.stored_at,
    });
  } catch (err) {
    console.error("[Ingest] Unexpected error:", err.message || err);
    return res.status(500).json({ error: "Failed to ingest signal.", details: err.message });
  }
});

module.exports = router;
