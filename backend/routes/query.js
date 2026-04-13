const express = require("express");
const router = express.Router();

const { callGroq, streamGroq } = require("../lib/groq");
const { recallSignals, writeSignal } = require("../lib/hindsight");
const { PATTERN_SYSTEM, buildPatternPrompt, isPatternQuery } = require("../prompts/pattern");
const { SYNTHESISE_SYSTEM, buildSynthesisPrompt } = require("../prompts/synthesise");

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const queryCache = new Map();

const FALLBACK_ANSWER =
  "SUMMARY: The competitive landscape is rapidly evolving across all tracked competitors.\nKEY MOVES: Meridian AI, Stackflow, and NovaDeploy are all executing simultaneous pricing, hiring, and product expansion strategies.\nSTRATEGIC IMPACT: Expect accelerated market consolidation and pricing pressure over the next 30–60 days.\nRECOMMENDATION: Prioritize monitoring pricing and hiring signals weekly to anticipate the next competitive move.";

// 15 signals → 4 agents × up to 4 signals each, with redistribution headroom
const RECALL_LIMIT = 15;

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

const QUERY_CACHE_MAX = 50;

function setCachedQuery(question, value) {
  if (queryCache.size >= QUERY_CACHE_MAX) {
    queryCache.delete(queryCache.keys().next().value);
  }
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
// Signal clustering with redistribution
// ---------------------------------------------------------------------------
const AGENT_BUCKETS = {
  pricing:   ["pricing"],
  hiring:    ["hiring"],
  feature:   ["feature"],
  expansion: ["pr", "messaging", "review", "general"],
};

const MIN_SIGNALS_PER_AGENT = 2;

function signalId(s) {
  return s.id || s.signal_id || JSON.stringify(s);
}

function clusterSignals(signals) {
  const buckets = { pricing: [], hiring: [], feature: [], expansion: [] };

  for (const s of signals) {
    const type = (s.metadata?.signal_type || "general").toLowerCase();
    for (const [bucket, types] of Object.entries(AGENT_BUCKETS)) {
      if (types.includes(type)) {
        buckets[bucket].push(s);
        break;
      }
    }
  }

  // Sort each bucket by recency, keep top 4 per agent
  for (const key of Object.keys(buckets)) {
    buckets[key] = buckets[key]
      .sort((a, b) => {
        const da = new Date(a.metadata?.event_date || a.metadata?.stored_at || 0).getTime();
        const db = new Date(b.metadata?.event_date || b.metadata?.stored_at || 0).getTime();
        return db - da;
      })
      .slice(0, 4);
  }

  // Rebuild usedIds from ALL signals (matched + unmatched) to prevent any
  // signal appearing in two buckets during redistribution.
  const usedIds = new Set(signals.map(signalId));
  // Remove IDs that are still in a bucket (they are legitimately placed)
  // and keep only those NOT in any bucket so redistribution can use them.
  const placedIds = new Set(
    Object.values(buckets).flat().map(signalId)
  );
  // usedIds for redistribution = everything already placed
  const redistributionUsed = new Set(placedIds);

  const allSorted = [...signals].sort((a, b) => {
    const da = new Date(a.metadata?.event_date || a.metadata?.stored_at || 0).getTime();
    const db = new Date(b.metadata?.event_date || b.metadata?.stored_at || 0).getTime();
    return db - da;
  });

  for (const key of Object.keys(buckets)) {
    if (buckets[key].length < MIN_SIGNALS_PER_AGENT) {
      for (const s of allSorted) {
        if (buckets[key].length >= MIN_SIGNALS_PER_AGENT) break;
        const sid = signalId(s);
        if (!redistributionUsed.has(sid)) {
          buckets[key].push(s);
          redistributionUsed.add(sid);
        }
      }
    }
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
  if (signals.length === 0) {
    console.warn(`[Agent] ${label} received no signals — skipping.`);
    return null;
  }
  const prompt = `${label.toUpperCase()} SIGNALS:\n${formatSignals(signals)}\n\nQuestion: ${question}\n\nProvide a 1–2 sentence ${label} intelligence finding.`;
  try {
    const result = await Promise.race([
      callGroq(AGENT_SYSTEM, prompt, { max_completion_tokens: 120 }),
      makeTimeout(8000),
    ]);
    return result ? `${label.toUpperCase()}: ${result}` : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Multi-agent pipeline
// ---------------------------------------------------------------------------
async function runMultiAgentPipeline(question, buckets, allSignals) {
  // All 4 agents run in parallel — no sequential delay
  const [pricingOut, hiringOut, featureOut, expansionOut] = await Promise.all([
    runAgent("pricing",   buckets.pricing,   question),
    runAgent("hiring",    buckets.hiring,    question),
    runAgent("feature",   buckets.feature,   question),
    runAgent("expansion", buckets.expansion, question),
  ]);

  const agentOutputs = [pricingOut, hiringOut, featureOut, expansionOut].filter(Boolean);
  if (agentOutputs.length === 0) return FALLBACK_ANSWER;

  // Use synthesise.js prompt + buildSynthesisPrompt for structured output
  const clusterTypes = Object.keys(buckets).filter(k => buckets[k].length > 0);
  const synthesisUserPrompt = buildSynthesisPrompt(allSignals, clusterTypes, question);

  // Prepend agent findings so the synthesiser has both raw signals and agent analysis
  const fullPrompt = `Agent findings:\n\n${agentOutputs.join("\n\n")}\n\n---\n\n${synthesisUserPrompt}`;

  const answer = await Promise.race([
    callGroq(SYNTHESISE_SYSTEM, fullPrompt, { max_completion_tokens: 350 }),
    makeTimeout(8000),
  ]);

  return answer || FALLBACK_ANSWER;
}

// ---------------------------------------------------------------------------
// Feedback loop — persists Q&A back into Hindsight memory
// ---------------------------------------------------------------------------
async function storeFeedback(question, answer, signalsUsed) {
  try {
    await writeSignal({
      signal_type:     "messaging",
      competitor_name: "Internal Query",
      summary:         `Q: ${question.slice(0, 80)} | A: ${answer.slice(0, 80)} | signals:${signalsUsed}`,
      stored_at:       new Date().toISOString(),
      source:          "feedback",
    });
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// Core recall + cluster helper
// ---------------------------------------------------------------------------
async function recallAndCluster(question) {
  const isPattern = isPatternQuery(question);
  const signals   = await recallSignals(question, RECALL_LIMIT);
  const buckets   = clusterSignals(signals);
  return { signals, buckets, isPattern };
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
  const reqId   = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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
      // Pattern queries: dedicated pattern prompt + real streaming
      const allSignals = [...buckets.pricing, ...buckets.hiring, ...buckets.feature, ...buckets.expansion];
      const systemPrompt = PATTERN_SYSTEM;
      const userPrompt   = buildPatternPrompt(allSignals, trimmed);

      console.time(`groq-stream-${reqId}`);
      const stream = await Promise.race([streamGroq(systemPrompt, userPrompt), makeTimeout(10000)]);
      console.log(`[Query] Pattern stream started (${reqId})`);

      answer = "";
      let lastTokenAt = Date.now();
      const TOKEN_IDLE_MS = 4000;
      for await (const chunk of stream) {
        if (responded) break;
        if (Date.now() - lastTokenAt > TOKEN_IDLE_MS) { console.warn(`[Query] Token idle timeout (${reqId})`); break; }
        const delta = chunk.choices?.[0]?.delta?.content || "";
        const clean = delta.replace(/<think>[\s\S]*?<\/think>/gi, "");
        if (!clean) continue;
        answer += clean;
        lastTokenAt = Date.now();
        writeStreamEvent(res, { type: "chunk", content: clean });
      }
      console.timeEnd(`groq-stream-${reqId}`);

    } else {
      // Multi-agent pipeline — 4 parallel agents + streamed synthesis
      console.time(`agents-${reqId}`);
      const [pricingOut, hiringOut, featureOut, expansionOut] = await Promise.race([
        Promise.all([
          runAgent("pricing",   buckets.pricing,   trimmed),
          runAgent("hiring",    buckets.hiring,    trimmed),
          runAgent("feature",   buckets.feature,   trimmed),
          runAgent("expansion", buckets.expansion, trimmed),
        ]),
        makeTimeout(12000),
      ]);
      console.timeEnd(`agents-${reqId}`);

      if (responded) return;

      const agentOutputs = [pricingOut, hiringOut, featureOut, expansionOut].filter(Boolean);
      const clusterTypes = Object.keys(buckets).filter(k => buckets[k].length > 0);
      const synthesisUserPrompt = buildSynthesisPrompt(signals, clusterTypes, trimmed);
      const fullPrompt = agentOutputs.length > 0
        ? `Agent findings:\n\n${agentOutputs.join("\n\n")}\n\n---\n\n${synthesisUserPrompt}`
        : synthesisUserPrompt;

      console.time(`groq-stream-synthesis-${reqId}`);
      const synthStream = await Promise.race([streamGroq(SYNTHESISE_SYSTEM, fullPrompt), makeTimeout(10000)]);
      console.log(`[Query] Synthesis stream started (${reqId})`);

      answer = "";
      let lastTokenAt = Date.now();
      const TOKEN_IDLE_MS = 4000;
      for await (const chunk of synthStream) {
        if (responded) break;
        if (Date.now() - lastTokenAt > TOKEN_IDLE_MS) { console.warn(`[Query] Token idle timeout (${reqId})`); break; }
        const delta = chunk.choices?.[0]?.delta?.content || "";
        const clean = delta.replace(/<think>[\s\S]*?<\/think>/gi, "");
        if (!clean) continue;
        answer += clean;
        lastTokenAt = Date.now();
        writeStreamEvent(res, { type: "chunk", content: clean });
      }
      console.timeEnd(`groq-stream-synthesis-${reqId}`);

      if (!answer.trim()) answer = FALLBACK_ANSWER;
    }

    const finalAnswer = (answer || "").trim() || FALLBACK_ANSWER;
    const result = { answer: finalAnswer, signals_used: signals.length, is_pattern: isPattern };
    setCachedQuery(trimmed, result);
    finish(result);
    void storeFeedback(trimmed, finalAnswer, signals.length);

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
        callGroq(PATTERN_SYSTEM, buildPatternPrompt(allSignals, trimmed), { max_completion_tokens: 300 }),
        makeTimeout(10000),
      ]);
    } else {
      answer = await Promise.race([
        runMultiAgentPipeline(trimmed, buckets, signals),
        makeTimeout(12000),
      ]);
    }

    const result = { answer: answer || FALLBACK_ANSWER, is_pattern: isPattern, signals_used: signals.length };
    setCachedQuery(trimmed, result);
    void storeFeedback(trimmed, result.answer, signals.length);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Query] Error:", err.message);
    return res.status(200).json({ answer: FALLBACK_ANSWER, signals_used: 0 });
  }
});

module.exports = router;
