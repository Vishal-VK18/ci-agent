require("dotenv").config();
const express = require("express");
const cors = require("cors");

const ingestRouter = require("./routes/ingest");
const queryRouter = require("./routes/query");
const seedRouter = require("./routes/seed");

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
