const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

const { writeSignal } = require("../lib/hindsight");

/**
 * POST /seed
 * Load all signals from data/fixtures.json and write them to Hindsight
 * with a 200ms delay between each write.
 *
 * Response:
 *   { count, total, errors }
 */
router.post("/", async (req, res) => {
  try {
    // Load fixtures file
    const fixturesPath = path.resolve(__dirname, "../data/fixtures.json");

    if (!fs.existsSync(fixturesPath)) {
      return res.status(404).json({ error: "fixtures.json not found in data directory." });
    }

    let fixtures;
    try {
      const raw = fs.readFileSync(fixturesPath, "utf-8");
      fixtures = JSON.parse(raw);
    } catch (parseErr) {
      return res.status(422).json({ error: "Failed to parse fixtures.json.", details: parseErr.message });
    }

    if (!Array.isArray(fixtures)) {
      return res.status(422).json({ error: "fixtures.json must contain a JSON array." });
    }

    const total = fixtures.length;

    if (total === 0) {
      return res.status(200).json({ count: 0, total: 0, errors: [] });
    }

    let count = 0;
    const errors = [];

    // Write each signal one by one with 200ms delay between
    for (let i = 0; i < fixtures.length; i++) {
      const signal = fixtures[i];

      try {
        // Add stored_at timestamp if not present
        if (!signal.stored_at) {
          signal.stored_at = new Date().toISOString();
        }

        await writeSignal(signal);
        count++;
        console.log(`[Seed] Wrote signal ${i + 1}/${total}: ${signal.competitor_name || "unknown"}`);
      } catch (writeErr) {
        console.error(`[Seed] Failed to write signal ${i + 1}:`, writeErr.message);
        errors.push({
          index: i,
          signal: signal?.competitor_name || `index_${i}`,
          error: writeErr.message,
        });
      }

      // 200ms delay between writes (skip delay after last signal)
      if (i < fixtures.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return res.status(200).json({ count, total, errors });
  } catch (err) {
    console.error("[Seed] Unexpected error:", err.message || err);
    return res.status(500).json({ error: "Failed to seed signals.", details: err.message });
  }
});

module.exports = router;
