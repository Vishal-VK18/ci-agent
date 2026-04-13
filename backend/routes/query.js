const express = require("express");
const router = express.Router();

const { callGroq, streamGroq } = require("../lib/groq");
const { recallSignals, writeSignal } = require("../lib/hindsight");
const { PATTERN_SYSTEM, buildPatternPrompt, isPatternQuery } = require("../prompts/pattern");

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const queryCache = new Map();

const FALLBACK_ANSWER =
  "Based on available intelligence signals, this sector is rapidly evolving with strong pricing competition, active hiring, and accelerating market expansion. Monitor all three competitors closely over the next 30 days.";

// Recall 12 signals — enough for 4 agents × 3 signals each
const RECALL_LIMIT = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeQuestion(q) {
  return String(q || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getCachedQuery(question) {
  const key = normalizeQuestion(question);
  const cached = queryCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) { queryCache.delete(key); return null; }
  return cached.value;
}

function setCachedQuery(question, value) {
  queryCache.set(normalizeQuestion(question), {
    value,
    expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
  });
}

function writeStreamEvent(res, payload) {
  try { res.write(`${JSON.stringify(payload)}\n`); } catch { /* socket gone */ }
}

function safeEnd(res) {
  try { res.end(); } catch { /* already ended */ }
}

function makeTimeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
}

// ---------------------------------------------------------------------------
// Signal clustering
// ---------------------------------------------------------------------------
const AGENT_BUCKETS = {
  pricing:   ["pricing"],
  hiring:    ["hiring"],
  feature:   ["feature"],
  expansion: ["pr", "messaging", "review", "general"],
};

function clusterSignals(signals) {
  const buckets = { pricing: [], hiring: [], feature: [], expansion: [] };

  for (const s of signals) {
    const type = (s.metadata?.signal_type || "general").toLowerCase();
    let placed = false;
    for (const [bucket, types] of Object.entries(AGENT_BUCKETS)) {
      if (types.includes(type)) {
        buckets[bucket].push(s);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.expansion.push(s);
  }

  // Sort each bucket by recency, keep top 3 per agent
  for (const key of Object.keys(buckets)) {
    buckets[key] = buckets[key]
      .sort((a, b) => {
        const da = new Date(a.metadata?.event_date || a.metadata?.stored_at || 0).getTime();
        const db = new Date(b.metadata?.event_date || b.metadata?.stored_at || 0).getTime();
        return db - da;
      })
      .slice(0, 3);
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Mini-agent prompts
// ---------------------------------------------------------------------------
function formatSignals(signals) {
  return signals.map((s, i) => {
    const content = (s.content || s.text || JSON.stringify(s)).slice(0, 130);
    const meta    = s.metadata || {};
    const date    = meta.event_date || meta.stored_at || "unknown";
    const comp    = meta.competitor_name || "Unknown";
    return `${i + 1}. [${comp}, ${date}] ${content}`;
  }).join("\n");
}

const AGENT_SYSTEM = "You are a competitive intelligence analyst. Answer in 1–2 sentences max. Be specific and cite the competitor name and date.";

async function runAgent(label, signals, question) {
  if (signals.length === 0) return null;
  const prompt = `${label.toUpperCase()} SIGNALS:\n${formatSignals(signals)}\n\nQuestion: ${question}\n\nProvide a 1–2 sentence ${label} intelligence finding.`;
  try {
    const result = await Promise.race([
      callGroq(AGENT_SYSTEM, prompt),
      makeTimeout(8000),
    ]);
    return result ? `${label.toUpperCase()}: ${result}` : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Synthesis system prompt
// ---------------------------------------------------------------------------
const SYNTHESIS_SYSTEM = `You are a senior competitive intelligence analyst producing an executive brief.

You will receive findings from 4 specialist agents. Combine them into a structured brief.

Format (use these exact labels, one per line):
SUMMARY: one sentence overview of the competitive situation.
KEY MOVES: the 2–3 most significant competitor actions observed.
STRATEGIC IMPACT: what this means for the market in the next 30–90 days.
RECOMMENDATION: one concrete action the reader should take now.

Rules:
- Total answer under 180 words.
- Cite competitor names and signal types inline.
- Never include debug text or <think> tags.`;

async function runSynthesis(agentOutputs, question) {
  const findings = agentOutputs.filter(Boolean).join("\n\n");
  if (!findings) return FALLBACK_ANSWER;

  const prompt = `Agent findings:\n\n${findings}\n\nQuestion: ${question}\n\nWrite the 4-section intelligence brief now.`;
  return await Promise.race([
    callGroq(SYNTHESIS_SYSTEM, prompt),
    makeTimeout(8000),
  ]);
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------
async function recallAndCluster(question) {
  const isPattern = isPatternQuery(question);
  const signals   = await recallSignals(question, RECALL_LIMIT);
  const buckets   = clusterSignals(signals);
  return { signals, buckets, isPattern };
}

async function runMultiAgentPipeline(question, buckets) {
  // Run all 4 agents in parallel — no sequential delay
  const [pricingOut, hiringOut, featureOut, expansionOut] = await Promise.all([
    runAgent("pricing",   buckets.pricing,   question),
    runAgent("hiring",    buckets.hiring,    question),
    runAgent("feature",   buckets.feature,   question),
    runAgent("expansion", buckets.expansion, question),
  ]);

  const answer = await runSynthesis(
    [pricingOut, hiringOut, featureOut, expansionOut],
    question
  );

  return answer || FALLBACK_ANSWER;
}

async function storeFeedback(question, answer) {
  try {
    await writeSignal({
      signal_type:     "messaging",
      competitor_name: "Internal Query",
      summary:         `Q: ${question.slice(0, 80)} | A: ${answer.slice(0, 80)}`,
      stored_at:       new Date().toISOString(),
    });
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// POST /query/stream
// ---------------------------------------------------------------------------
router.post("/stream", async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "Field 'question' is required." });
  }

  const trimmed = question.trim();
  const reqId   = Date.now();

  // Send headers immediately — client unblocks at once
  res.writeHead(200, {
    "Content-Type":    "application/x-ndjson; charset=utf-8",
    "Cache-Control":   "no-cache, no-transform",
    Connection:        "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  writeStreamEvent(res, { type: "status", content: "Analyzing intelligence signals..." });

  let responded = false;

  const globalFailsafe = setTimeout(() => {
    if (!responded) {
      responded = true;
      console.warn(`[Query] Global failsafe triggered (${reqId})`);
      writeStreamEvent(res, { type: "done", answer: FALLBACK_ANSWER, signals_used: 0, is_pattern: false });
      safeEnd(res);
    }
  }, 14000);

  const finish = (payload) => {
    if (responded) return;
    responded = true;
    clearTimeout(globalFailsafe);
    writeStreamEvent(res, { type: "done", ...payload });
    safeEnd(res);
  };

  // Cache hit
  const cached = getCachedQuery(trimmed);
  if (cached) {
    writeStreamEvent(res, { type: "chunk", content: cached.answer });
    finish(cached);
    return;
  }

  try {
    // Recall + cluster
    console.time(`recall-${reqId}`);
    const { signals, buckets, isPattern } = await Promise.race([
      recallAndCluster(trimmed),
      makeTimeout(10000),
    ]);
    console.timeEnd(`recall-${reqId}`);
    console.log(`[Query] ${signals.length} signals recalled | buckets: pricing=${buckets.pricing.length} hiring=${buckets.hiring.length} feature=${buckets.feature.length} expansion=${buckets.expansion.length}`);

    if (responded) return;

    let answer;

    if (isPattern) {
      // Pattern queries use the dedicated pattern prompt + stream
      const allSignals = [...buckets.pricing, ...buckets.hiring, ...buckets.feature, ...buckets.expansion];
      const { systemPrompt, userPrompt } = {
        systemPrompt: PATTERN_SYSTEM,
        userPrompt:   buildPatternPrompt(allSignals, trimmed),
      };

      console.time(`groq-${reqId}`);
      const stream = await Promise.race([streamGroq(systemPrompt, userPrompt), makeTimeout(10000)]);
      console.log(`[Query] Pattern stream started (${reqId})`);

      answer = "";
      for await (const chunk of stream) {
        if (responded) break;
        const delta = chunk.choices?.[0]?.delta?.content || "";
        const clean = delta.replace(/<think>[\s\S]*?<\/think>/gi, "");
        if (!clean) continue;
        answer += clean;
        writeStreamEvent(res, { type: "chunk", content: clean });
      }
      console.timeEnd(`groq-${reqId}`);

    } else {
      // Multi-agent pipeline — 4 parallel agents + synthesis
      console.time(`agents-${reqId}`);
      answer = await Promise.race([
        runMultiAgentPipeline(trimmed, buckets),
        makeTimeout(12000),
      ]);
      console.timeEnd(`agents-${reqId}`);

      // Stream the final answer as a single chunk so the frontend renders it
      if (!responded) {
        writeStreamEvent(res, { type: "chunk", content: answer });
      }
    }

    const finalAnswer = (answer || "").trim() || FALLBACK_ANSWER;
    const result = { answer: finalAnswer, signals_used: signals.length, is_pattern: isPattern };
    setCachedQuery(trimmed, result);
    finish(result);
    void storeFeedback(trimmed, finalAnswer);

  } catch (err) {
    console.error(`[Query] Error (${reqId}):`, err.message);
    finish({ answer: FALLBACK_ANSWER, signals_used: 0, is_pattern: false });
  }
});

// ---------------------------------------------------------------------------
// POST /query  (non-streaming fallback)
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "Field 'question' is required." });
  }

  const trimmed = question.trim();
  const cached  = getCachedQuery(trimmed);
  if (cached) return res.status(200).json(cached);

  try {
    const { signals, buckets, isPattern } = await Promise.race([
      recallAndCluster(trimmed),
      makeTimeout(10000),
    ]);

    let answer;
    if (isPattern) {
      const allSignals = [...buckets.pricing, ...buckets.hiring, ...buckets.feature, ...buckets.expansion];
      answer = await Promise.race([
        callGroq(PATTERN_SYSTEM, buildPatternPrompt(allSignals, trimmed)),
        makeTimeout(10000),
      ]);
    } else {
      answer = await Promise.race([
        runMultiAgentPipeline(trimmed, buckets),
        makeTimeout(12000),
      ]);
    }

    const result = { answer: answer || FALLBACK_ANSWER, is_pattern: isPattern, signals_used: signals.length };
    setCachedQuery(trimmed, result);
    void storeFeedback(trimmed, result.answer);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Query] Error:", err.message);
    return res.status(200).json({ answer: FALLBACK_ANSWER, signals_used: 0 });
  }
});

module.exports = router;
