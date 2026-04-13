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

    const now = new Date().toISOString();
    const results = await Promise.allSettled(
      fixtures.map(signal =>
        writeSignal({ ...signal, stored_at: signal.stored_at || now })
      )
    );

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        count++;
        console.log(`[Seed] Wrote signal ${i + 1}/${total}: ${fixtures[i].competitor_name || "unknown"}`);
      } else {
        console.error(`[Seed] Failed to write signal ${i + 1}:`, r.reason?.message);
        errors.push({
          index: i,
          signal: fixtures[i]?.competitor_name || `index_${i}`,
          error: r.reason?.message,
        });
      }
    });

    return res.status(200).json({ count, total, errors });
  } catch (err) {
    console.error("[Seed] Unexpected error:", err.message || err);
    return res.status(500).json({ error: "Failed to seed signals.", details: err.message });
  }
});

module.exports = router;
