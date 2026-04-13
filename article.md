# How I Stopped Fighting My AI Agent's Memory Problem and Used Hindsight Instead

Every competitive intelligence tool I'd used before had the same flaw: ask it something today, ask it again tomorrow, and it had no idea what you were talking about yesterday. Each query was stateless. Each answer was generated from scratch. The system had no concept of what it already knew.

That's fine for a search engine. It's not fine for an agent that's supposed to track competitor behavior over months.

So I built one that actually remembers — and one that reasons through a multi-agent pipeline instead of a single LLM call.

## What the System Does

The Competitive Intelligence Agent monitors competitor signals — pricing changes, product launches, strategic hires, messaging shifts — and stores each one as a structured memory in [Hindsight](https://github.com/vectorize-io/hindsight). When you ask a question, it doesn't search the web. It recalls semantically relevant signals from that memory bank, routes them through four specialized agents running in parallel, and returns a cited intelligence briefing.

The architecture is four stages:

1. **Ingest** — raw text in, structured signal out, written to Hindsight
2. **Recall** — natural language question in, 10–15 high-confidence signals out
3. **Multi-Agent Analysis** — four specialized agents process signal clusters in parallel
4. **Synthesize** — agent findings + signals in, cited executive briefing out

There's also a feedback loop: every Q&A pair gets written back to Hindsight as a new signal. Future queries benefit from the reasoning of past queries. The system compounds.

The stack is Node.js and Express on the backend, vanilla JS on the frontend, [Groq](https://console.groq.com) running Llama 3.3 70B for inference, and [Hindsight](https://hindsight.vectorize.io/) for persistent memory.

## The Core Technical Story: Memory as Architecture

The decision that shaped everything else was treating memory as the foundation, not a feature.

Early on I considered building a custom vector store. The math looked fine — simpler operations, direct control. But I kept running into the same problem: I was spending engineering time on infrastructure that had nothing to do with competitive intelligence. Embedding management, index tuning, reranking — none of that was the product.

I needed a way to give my [agent memory](https://vectorize.io/what-is-agent-memory) without building the memory system myself. I decided to try [Hindsight](https://github.com/vectorize-io/hindsight) because it's purpose-built for exactly this: agents that need to store structured facts, recall them by semantic meaning, and learn from repeated interactions.

The integration ended up being two functions. That's it.

```javascript
// backend/lib/hindsight.js

async function writeSignal(signal) {
  const hindsight = getClient();
  const content = `[${signal.signal_type}] ${signal.competitor_name}: ${signal.summary}`;
  const metadata = {
    signal_type:     signal.signal_type,
    competitor_name: signal.competitor_name,
    event_date:      signal.event_date  || '',
    entities:        (signal.entities   || []).join(', '),
    stored_at:       signal.stored_at   || new Date().toISOString(),
    source:          signal.source      || 'signal',
  };
  return await hindsight.retain(BANK_ID, content, {
    metadata,
    timestamp: signal.event_date ? new Date(signal.event_date) : new Date(),
    context:   `Competitive signal for ${signal.competitor_name}`,
  });
}

async function recallSignals(query, topK = 12, excludeFeedback = true) {
  const hindsight = getClient();
  // Budget scales with topK: >10 → "high", >5 → "mid", else → "low"
  const budget = topK > 10 ? "high" : topK > 5 ? "mid" : "low";
  const result = await hindsight.recall(BANK_ID, query, { budget, top_k: topK });
  // ... normalize result shape, filter feedback signals
  return signals.slice(0, topK);
}
```

No embedding logic. No index management. No reranking code. Hindsight abstracts all of it. I write structured data and query by semantic meaning. The `budget` parameter is important: the query pipeline requests `topK = 15` with `budget: "high"` to give the multi-agent system enough signal coverage, while analytics endpoints use `topK = 12` or `15` with `budget: "mid"` for a faster, balanced sweep.

## Ingestion: Where Signal Quality Is Decided

The `/ingest` endpoint takes raw text — a press release, a LinkedIn post, a pricing page change — and uses Groq to extract a structured signal before writing it to memory.

The tricky part was that Groq doesn't always return clean JSON. It sometimes wraps responses in markdown fences, includes reasoning blocks, or adds surrounding commentary. I had to be explicit about stripping all of it:

```javascript
// backend/routes/ingest.js

let cleanedJson = rawResponse.trim()
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .trim();

if (cleanedJson.startsWith('```')) {
  cleanedJson = cleanedJson
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

const jsonStart = cleanedJson.indexOf('{');
const jsonEnd   = cleanedJson.lastIndexOf('}');
cleanedJson = cleanedJson.slice(jsonStart, jsonEnd + 1);
```

Then strict validation before anything touches memory. The ingest route also normalizes free-text signal type variants from the LLM — "strategic hire" → `hiring`, "market expansion" → `pr`, "product launch" → `feature` — via a `TYPE_ALIASES` map, so the memory bank stays clean even when the model is creative with its vocabulary.

One bad extraction in memory creates noise that every future query has to filter through. The validation is strict because garbage in means garbage reasoning out.

## The Multi-Agent Pipeline: Four Specialists, One Answer

The most architecturally significant part of the system is the query pipeline. Rather than passing all recalled signals to a single LLM call, the system routes them through four specialized agents that run in parallel.

### Signal Clustering

When a question arrives, the system recalls 10–15 high-confidence signals from Hindsight and clusters them by type:

```javascript
// backend/routes/query.js

const RECALL_LIMIT = 15; // 4 agents × up to 4 signals each, with redistribution headroom

const AGENT_BUCKETS = {
  pricing:   ["pricing"],
  hiring:    ["hiring"],
  feature:   ["feature"],
  expansion: ["pr", "messaging", "review", "general"],
};
```

Each bucket is sorted by recency and capped at 4 signals per agent. If any bucket falls below 2 signals, a redistribution pass fills it from unassigned signals — so every agent has meaningful input without duplication.

### Parallel Execution

All four agents fire simultaneously via `Promise.all`:

```javascript
const [pricingOut, hiringOut, featureOut, expansionOut] = await Promise.all([
  runAgent("pricing",   buckets.pricing,   question),
  runAgent("hiring",    buckets.hiring,    question),
  runAgent("feature",   buckets.feature,   question),
  runAgent("expansion", buckets.expansion, question),
]);
```

Each agent receives only its relevant signals and returns a 1–2 sentence finding with a 120-token cap and an 8-second timeout. No agent blocks another.

### Synthesis

The four agent outputs are prepended to a structured synthesis prompt and streamed through Groq's API. The synthesis layer sees both the raw signals (grouped by type) and the agent findings, producing a four-section intelligence brief: SUMMARY, KEY MOVES, STRATEGIC IMPACT, and RECOMMENDATION — each under 160 words total, with inline citations like `[pricing, 2025-01]`.

Pattern queries — questions containing keywords like "trend", "recurring", "predict", or "history" — bypass the multi-agent pipeline and route directly to a dedicated pattern prompt that identifies recurring competitor behaviors across the full signal set.

## Streaming: Why It Matters for Perceived Performance

The query endpoint streams responses over NDJSON. Headers are flushed immediately, so the client unblocks the moment the request is accepted — before any LLM call completes. The frontend renders tokens as they arrive.

```javascript
// POST /query/stream
res.writeHead(200, {
  "Content-Type":    "application/x-ndjson; charset=utf-8",
  "Cache-Control":   "no-cache, no-transform",
  "Connection":      "keep-alive",
  "X-Accel-Buffering": "no",
});
res.flushHeaders?.();
writeStreamEvent(res, { type: "status", content: "Analyzing intelligence signals..." });
```

A 14-second global failsafe ensures the connection always closes cleanly. Repeated queries are served from an in-memory cache (5-minute TTL, 50-entry LRU) with zero LLM calls. In practice, responses feel near-instant for cached queries and stream within 2 seconds for new ones.

## What Surprised Me: Patterns Emerge Without Being Programmed

The most unexpected behavior was pattern detection. The system detects pattern-intent queries automatically using keyword matching (`isPatternQuery`), then routes them to a dedicated prompt that reasons across the full recalled signal set:

```
What patterns do you see in how competitors are approaching enterprise pricing?
```

Returns:

> PATTERN: All three tracked competitors executed pricing changes within 60 days of a major product launch — Meridian AI cut Pro tier pricing [pricing, 2025-01-08] before shipping its ingestion API [feature, 2025-02-25], Stackflow raised Starter pricing [pricing, 2025-01-10] ahead of its Salesforce native app [feature, 2025-02-22], and NovaDeploy introduced usage-based pricing [pricing, 2025-01-19] before its monitoring dashboard launch [feature, 2025-02-20].
>
> PREDICTION: Expect another pricing move from at least one competitor within 30 days of their next feature announcement.

That pattern wasn't in any single signal. It emerged from temporal analysis across 30 structured signals spanning three competitors. This is what happens when you give an AI system real [agent memory](https://vectorize.io/what-is-agent-memory) — not just retrieval, but the ability to reason across everything it knows.

## Lessons Learned

**Memory architecture is not about databases — it's about how you think about the system.** Once I stopped treating Hindsight as a storage layer to optimize around and started designing everything to leverage semantic recall, the whole system became cleaner. The API routes are simple because they do one thing: move data into or out of the memory bank.

**Limiting recall to 10–15 signals is a feature, not a constraint.** Early versions tried to pass every available signal to the LLM. Response quality degraded — too much noise, too little focus. Capping at 15 signals with recency sorting and semantic relevance ranking produces sharper, more actionable answers. The multi-agent clustering amplifies this: each agent sees only the signals most relevant to its domain.

**Strict schema discipline compounds over time.** Enforcing `signal_type`, `competitor_name`, `event_date`, `summary`, and `entities` on every signal costs nothing upfront. It becomes invaluable when you have 30+ signals and need to reason about temporal patterns or filter by company. Bad structure early creates friction at scale.

**Parallel agents beat sequential reasoning for breadth.** A single LLM call over mixed signals tends to over-index on the most prominent signal type. Running four specialized agents in parallel and synthesizing their outputs produces more balanced coverage — pricing trends don't crowd out hiring signals, and expansion moves don't get buried under feature announcements.

**Real-time ingestion changes user behavior.** Once users could ingest a signal and immediately ask about it in the same session, they started treating the system differently — less like a search tool, more like a briefing partner they were actively feeding information. That behavioral shift was not something I anticipated, and it's the most interesting product insight from building this.

The full implementation is built on [Hindsight](https://github.com/vectorize-io/hindsight) for memory, Groq for inference, and a straightforward Express API. The memory layer is what makes the difference — not the model, not the prompts. An agent that remembers is a fundamentally different product than one that doesn't.
