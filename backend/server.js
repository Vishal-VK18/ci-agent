require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const ingestRouter = require("./routes/ingest");
const queryRouter  = require("./routes/query");
const seedRouter   = require("./routes/seed");
const signalsRouter = require("./routes/signals");
const analyticsRouter = require("./routes/analytics");

// ─── Startup environment validation ───────────────────────────────────────────
// Runs before Express starts. Any placeholder value will print a clear message
// and exit so you know exactly what to fix in backend/.env
const REQUIRED_ENV = {
  GROQ_API_KEY:           process.env.GROQ_API_KEY,
  HINDSIGHT_API_KEY:      process.env.HINDSIGHT_API_KEY,
  HINDSIGHT_INSTANCE_URL: process.env.HINDSIGHT_INSTANCE_URL,
};
const PLACEHOLDERS = new Set(["your_url_here", "your_key_here", "", undefined, null]);

console.log("\n─── CI Agent — Environment Check ───────────────────────");
let configOk = true;
for (const [key, val] of Object.entries(REQUIRED_ENV)) {
  const isPlaceholder = PLACEHOLDERS.has(val);
  const display = isPlaceholder
    ? `❌  NOT SET  (current: "${val}")`
    : key.includes("URL") ? `✅  ${val}` : `✅  ${"*".repeat(8)} (set)`;
  console.log(`  ${key.padEnd(26)}  ${display}`);
  if (isPlaceholder) configOk = false;
}
console.log("────────────────────────────────────────────────────────\n");

if (!configOk) {
  console.error("❌  One or more required environment variables are not configured.");
  console.error("    Open d:\\ci-agent\\backend\\.env and set real values.\n");
  console.error("    Where to get credentials:");
  console.error("      GROQ_API_KEY           → https://console.groq.com/keys");
  console.error("      HINDSIGHT_API_KEY      → https://app.vectorize.io  (Settings → API Keys)");
  console.error("      HINDSIGHT_INSTANCE_URL → https://app.vectorize.io  (Settings → Instance URL)\n");
  process.exit(1);
}
// ──────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health route
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "CI Agent running" });
});

// Mount routes
app.use("/ingest", ingestRouter);
app.use("/query", queryRouter);
app.use("/seed", seedRouter);
app.use("/signals", signalsRouter);
app.use("/analytics", analyticsRouter);

// Static frontend serving
app.use(express.static(path.join(__dirname, "../frontend")));

// Serve index.html for the root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message || err);
  res.status(500).json({ error: "Internal server error", details: err.message });
});

app.listen(PORT, () => {
  console.log(`CI Agent backend running on http://localhost:${PORT}`);
});

module.exports = app;
