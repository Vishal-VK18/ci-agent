const express = require("express");
const router = express.Router();

const { callGroq } = require("../lib/groq");
const { recallSignals, writeSignal } = require("../lib/hindsight");
const { SYNTHESISE_SYSTEM, buildSynthesisPrompt } = require("../prompts/synthesise");
const { PATTERN_SYSTEM, buildPatternPrompt, isPatternQuery } = require("../prompts/pattern");

/**
 * POST /query
 * Answer a competitive intelligence question using recalled memory signals.
 * Automatically detects pattern queries and uses the appropriate prompt.
 *
 * Body:
 *   question {string} (required) - The user's natural language question.
 *
 * Response:
 *   { answer, is_pattern, signals_used }
 */
router.post("/", async (req, res) => {
  try {
    const { question } = req.body;

    // Input validation
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ error: "Field 'question' is required and must be a non-empty string." });
    }

    const trimmedQuestion = question.trim();

    // Step 1: Detect if this is a pattern query
    const isPattern = isPatternQuery(trimmedQuestion);

    // Step 2: Recall signals — more signals for pattern analysis
    const topK = isPattern ? 20 : 5;
    const signals = await recallSignals(trimmedQuestion, topK);

    // Step 3: Build prompt and call Groq
    let systemPrompt;
    let userPrompt;

    if (isPattern) {
      systemPrompt = PATTERN_SYSTEM;
      userPrompt = buildPatternPrompt(signals, trimmedQuestion);
    } else {
      systemPrompt = SYNTHESISE_SYSTEM;
      userPrompt = buildSynthesisPrompt(signals, trimmedQuestion);
    }

    const answer = await callGroq(systemPrompt, userPrompt);

    // Step 4: Store Q&A as a feedback loop memory signal
    try {
      const feedbackSignal = {
        signal_type: "messaging",
        competitor_name: "Internal Query",
        summary: `Q: ${trimmedQuestion.slice(0, 80)} | A: ${answer.slice(0, 80)}`,
        event_date: null,
        entities: [],
        stored_at: new Date().toISOString(),
      };
      await writeSignal(feedbackSignal);
    } catch (feedbackErr) {
      // Non-blocking: log but don't fail the request
      console.warn("[Query] Failed to store Q&A feedback signal:", feedbackErr.message);
    }

    // Return response
    return res.status(200).json({
      answer,
      is_pattern: isPattern,
      signals_used: signals.length,
    });
  } catch (err) {
    console.error("[Query] Unexpected error:", err.message || err);
    return res.status(500).json({ error: "Failed to process query.", details: err.message });
  }
});

module.exports = router;
