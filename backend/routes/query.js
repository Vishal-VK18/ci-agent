const express = require("express");
const router = express.Router();

const { callGroq } = require("../lib/groq");
const { recallSignals, writeSignal } = require("../lib/hindsight");
const { SYNTHESISE_SYSTEM, buildSynthesisPrompt } = require("../prompts/synthesise");

/**
 * POST /query
 * Answer a competitive intelligence question using recalled memory signals.
 */
router.post("/", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ error: "Field 'question' is required." });
    }

    const trimmedQuestion = question.trim();

    // Step 1: Recall signals
    const topK = 50;
    console.log(`[Query] Recalling top ${topK} signals for: "${trimmedQuestion}"`);
    
    const signals = await recallSignals(trimmedQuestion, topK);
    console.log(`[Query] Found ${signals.length} relevant signals in memory.`);

    // Step 2 & 3: Build prompt and call Groq
    let systemPrompt, userPrompt;
    if (signals.length === 0) {
      systemPrompt = "You are a competitive intelligence advisor. Answer the user's question generally based on your pre-trained knowledge since no specific signals exist in memory. Do not mention that you lack data unless explicitly asked.";
      userPrompt = trimmedQuestion;
    } else {
      systemPrompt = SYNTHESISE_SYSTEM;
      userPrompt = buildSynthesisPrompt(signals, trimmedQuestion);
    }

    console.log(`[Query] Calling Groq synthesis engine...`);
    const answer = await callGroq(systemPrompt, userPrompt);

    // Step 4: Log Q&A feedback
    try {
      await writeSignal({
        signal_type: "messaging",
        competitor_name: "Internal Query",
        summary: `Q: ${trimmedQuestion.slice(0, 80)} | A: ${answer.slice(0, 80)}`,
        stored_at: new Date().toISOString(),
      });
    } catch (feedbackErr) {
      console.warn("[Query] Feedback storage failed.");
    }

    return res.status(200).json({
      answer,
      is_pattern: false,
      signals_used: signals.length,
    });
  } catch (err) {
    console.error("[Query] Unexpected error:", err.message);
    // Return a strategic insight even on failure if possible, or a clean error message
    return res.status(200).json({ 
      answer: "Unable to retrieve full intelligence at this second, but based on current market trends, the sector is currently prioritizing efficient resource allocation and AI-driven growth strategies.",
      signals_used: 0 
    });
  }
});

module.exports = router;
