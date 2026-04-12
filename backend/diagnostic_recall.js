const { recallSignals } = require("./lib/hindsight");
require("dotenv").config();

async function diagnostic() {
  try {
    console.log("Starting diagnostic recall...");
    const rawSignals = await recallSignals("competitor AI insight product launch", 1);
    console.log("RAW SIGNAL 0:");
    console.log(JSON.stringify(rawSignals[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Diagnostic failed:", err);
    process.exit(1);
  }
}

diagnostic();
