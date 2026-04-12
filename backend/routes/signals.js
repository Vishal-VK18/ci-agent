const express = require("express");
const router = express.Router();
const { recallSignals } = require("../lib/hindsight");

/**
 * GET /signals
 * List recent competitive intelligence signals recorded in memory.
 * Uses a broad recall query to retrieve the most recent/relevant signals.
 */
router.get("/", async (req, res) => {
  try {
    // A broad query like "competitor signal" or "recent maneuvers"
    // helps pull a wide range of analytical segments from Hindsight.
    const query = req.query.q || "competitor AI insight product launch";
    const limit = parseInt(req.query.limit) || 20;

    console.log(`[Signals] Listing signals with query: "${query}", limit: ${limit}`);

    const signals = await recallSignals(query, limit);

    // Format the signals for easier consumption by the frontend table
    const formatted = signals.map(s => {
      // Deep search for properties
      const meta = s.metadata?.properties || s.metadata || s.properties || s || {};
      
      // Use Hindsight specific fields as high-fidelity fallbacks
      const name = meta.competitor_name || s.competitor_name || (Array.isArray(s.entities) && s.entities[0]) || "Enterprise Segment";
      const type = meta.signal_type     || s.signal_type     || (s.type === 'world' ? 'intelligence' : s.type) || "intelligence";
      const date = meta.event_date      || s.event_date      || s.mentioned_at || s.occurred_start || meta.stored_at || s.timestamp || new Date().toISOString();
      const summaryPart = meta.summary  || s.summary         || s.text || s.content || (typeof s === 'string' ? s : "");

      return {
        id: s.id || s.signal_id || null,
        competitor_name: name,
        signal_type: type,
        summary: summaryPart || "Market Intelligence Signal",
        event_date: date,
        score: s.score || 0
      };
    });

    return res.status(200).json({
      count: formatted.length,
      signals: formatted
    });
  } catch (err) {
    console.error("[Signals] Detail fetch failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch signals database.", details: err.message });
  }
});

module.exports = router;
