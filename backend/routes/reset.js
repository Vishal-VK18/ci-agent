const express = require("express");
const router = express.Router();
const { getClient, BANK_ID } = require("../lib/hindsight");

/**
 * POST /reset
 * Wipe the ci-agent memory bank by deleting and recreating it.
 */
router.post("/", async (req, res) => {
  try {
    const hindsight = getClient();

    await hindsight.deleteBank(BANK_ID);
    console.log(`[Reset] Deleted bank: ${BANK_ID}`);

    await hindsight.createBank(BANK_ID, { name: BANK_ID });
    console.log(`[Reset] Recreated bank: ${BANK_ID}`);

    return res.status(200).json({ deleted: true, bank: BANK_ID });
  } catch (err) {
    console.error("[Reset] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
