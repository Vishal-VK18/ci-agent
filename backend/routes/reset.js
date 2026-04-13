const express = require("express");
const router = express.Router();
const { getClient, BANK_ID } = require("../lib/hindsight");

/**
 * POST /reset
 * Wipe the ci-agent memory bank by deleting and recreating it.
 * Each step is isolated so a partial failure returns a clear error
 * rather than leaving the bank in an unknown state.
 */
router.post("/", async (req, res) => {
  const hindsight = getClient();

  try {
    await hindsight.deleteBank(BANK_ID);
    console.log(`[Reset] Deleted bank: ${BANK_ID}`);
  } catch (err) {
    console.error("[Reset] deleteBank failed:", err.message);
    return res.status(500).json({ error: "Failed to delete memory bank.", details: err.message });
  }

  try {
    await hindsight.createBank(BANK_ID, { name: BANK_ID });
    console.log(`[Reset] Recreated bank: ${BANK_ID}`);
  } catch (err) {
    console.error("[Reset] createBank failed after delete — bank is gone:", err.message);
    return res.status(500).json({
      error: "Memory bank deleted but could not be recreated. Run /seed to restore data.",
      details: err.message,
    });
  }

  return res.status(200).json({ deleted: true, bank: BANK_ID });
});

module.exports = router;
