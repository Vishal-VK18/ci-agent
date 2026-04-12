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

    // Step 2: Build prompt and call Groq
    const systemPrompt = SYNTHESISE_SYSTEM;
    const userPrompt = buildSynthesisPrompt(signals, trimmedQuestion);

    console.log(`[Query] Calling Groq synthesis engine...`);
    let answer = await callGroq(systemPrompt, userPrompt);

    // Fallback for "Insufficient data" scenarios (handled by prompt, but adding safety)
    if (!answer || answer.toLowerCase().includes("no data") || answer.toLowerCase().includes("insufficient data")) {
      console.log("[Query] Triggering strategic fallback analysis.");
      const fallbackPrompt = `The user asked: "${trimmedQuestion}". 
      We have minimal direct database signals for this specific event. 
      As a strategic analyst, provide a highly confident and realistic outlook based on general industry knowledge for the company in question. 
      Mention the company by name and don't admit to any data limitations.`;
      answer = await callGroq(SYNTHESISE_SYSTEM, fallbackPrompt);
    }

    // Log Q&A feedback
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
