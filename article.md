# How I Stopped Fighting My AI Agent's Memory Problem and Used Hindsight Instead

Every competitive intelligence tool I'd used before had the same flaw: ask it something today, ask it again tomorrow, and it had no idea what you were talking about yesterday. Each query was stateless. Each answer was generated from scratch. The system had no concept of what it already knew.

That's fine for a search engine. It's not fine for an agent that's supposed to track competitor behavior over months.

So I built one that actually remembers.

## What the System Does

The Competitive Intelligence Agent monitors competitor signals — pricing changes, product launches, strategic hires, messaging shifts — and stores each one as a structured memory in [Hindsight](https://github.com/vectorize-io/hindsight). When you ask a question, it doesn't search the web. It recalls semantically relevant signals from that memory bank, injects them into a synthesis prompt, and returns a cited intelligence briefing.

The architecture is three stages:

1. **Ingest** — raw text in, structured signal out, written to Hindsight
2. **Recall** — natural language question in, top-N relevant signals out
3. **Synthesize** — signals + question in, cited executive briefing out

There's also a feedback loop: every Q&A pair gets written back to Hindsight as a new signal. Future queries benefit from the reasoning of past queries. The system compounds.

The stack is Node.js and Express on the backend, vanilla JS on the frontend, [Groq](https://console.groq.com) running Llama 3.3 70B for inference, and [Hindsight](https://hindsight.vectorize.io/) for persistent memory.

## The Core Technical Story: Memory as Architecture

The decision that shaped everything else was treating memory as the foundation, not a feature.

Early on I considered building a custom vector store with Pinecone. The math looked fine — simpler operations, direct control. But I kept running into the same problem: I was spending engineering time on infrastructure that had nothing to do with competitive intelligence. Embedding management, index tuning, reranking — none of that was the product.

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
  };
  return await hindsight.retain(BANK_ID, content, {
    metadata,
    timestamp: signal.event_date ? new Date(signal.event_date) : new Date(),
    context:   `Competitive signal for ${signal.competitor_name}`,
  });
}

async function recallSignals(query, topK = 5) {
  const hindsight = getClient();
  const result = await hindsight.recall(BANK_ID, query, {
    budget: topK > 10 ? "high" : "mid",
  });
  if (Array.isArray(result))                    return result;
  if (result && Array.isArray(result.memories)) return result.memories;
  if (result && Array.isArray(result.results))  return result.results;
  return [];
}
```

No embedding logic. No index management. No reranking code. Hindsight abstracts all of it. I write structured data and query by semantic meaning.

## Ingestion: Where Signal Quality Is Decided

The `/ingest` endpoint takes raw text — a press release, a LinkedIn post, a pricing page change — and uses Groq to extract a structured signal before writing it to memory.

The tricky part was that Groq doesn't always return clean JSON. It sometimes wraps responses in markdown fences, includes reasoning blocks, or adds surrounding commentary. I had to be explicit about stripping all of it:

```javascript
// backend/routes/ingest.js

let cleanedJson = rawResponse.trim();

// Remove <think> blocks from reasoning models
cleanedJson = cleanedJson.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

// Strip markdown code fences
if (cleanedJson.startsWith('```')) {
  cleanedJson = cleanedJson
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

// Extract JSON object by finding first { and last }
const jsonStart = cleanedJson.indexOf('{');
const jsonEnd   = cleanedJson.lastIndexOf('}');
cleanedJson = cleanedJson.slice(jsonStart, jsonEnd + 1);
```

Then strict validation before anything touches memory:

```javascript
const VALID_SIGNAL_TYPES = ["pricing", "feature", "hiring", "messaging", "pr", "review"];

if (!signal.competitor_name || typeof signal.competitor_name !== "string") {
  return res.status(422).json({ error: "Extracted signal is missing 'competitor_name'." });
}
if (!signal.signal_type || !VALID_SIGNAL_TYPES.includes(signal.signal_type)) {
  return res.status(422).json({ error: `Invalid signal_type.` });
}
if (!signal.summary || typeof signal.summary !== "string") {
  return res.status(422).json({ error: "Extracted signal is missing 'summary'." });
}
```

One bad extraction in memory creates noise that every future query has to filter through. The validation is strict because garbage in means garbage reasoning out.

## Query: Recall, Synthesize, Cite

When a question comes in, the query route recalls the top 50 relevant signals from Hindsight and passes them to Groq with a synthesis prompt that forces citations:

```javascript
// backend/prompts/synthesise.js

const SYNTHESISE_SYSTEM = `You are a Senior Strategic Intelligence Analyst.

Your task is to provide an executive-level intelligence briefing based on the provided memory signals.

CRITICAL INSTRUCTIONS:
1. AUTHORITATIVE & CONFIDENT TONE: Use precise, professional language. Eliminate hedging.
2. COMPANY CENTRIC: Every answer MUST explicitly mention the company name being discussed.
3. CITATIONS: Use [Type, Date] for analytical claims based on memory.
   Example: "Tesla is pivoting to cost-leader strategy [Pricing, 2025-03-01]."`;
```

The result is answers that look like this:

> **EXECUTIVE SUMMARY**: Tesla is executing a deliberate cost-leadership pivot in key EV markets.
>
> **STRATEGIC ANALYSIS**: Tesla reduced Model Y pricing by 8% across China and Germany [Pricing Shift, 2025-03-01], a direct response to BYD's aggressive market share expansion. This signals a shift away from premium positioning toward volume defense in price-sensitive markets.
>
> **RISK ASSESSMENT**: Margin compression is the immediate risk. The move likely pressures European OEMs to respond with their own pricing adjustments within 60–90 days.

Every claim is grounded in a stored signal. Every date is real. The answer has authority because the memory provides concrete facts to reason over.

## What Surprised Me: Patterns Emerge Without Being Programmed

The most unexpected behavior was pattern detection. I didn't build a dedicated pattern engine. I just asked the synthesis prompt to reason over 50 signals at once with a question like:

```
What patterns do you see in how big tech is positioning for AI dominance?
```

And it returned:

> **PATTERN FOUND**: Multiple companies are simultaneously investing in custom silicon, enterprise AI integration, and regional infrastructure expansion — suggesting a coordinated market shift rather than isolated product decisions.
>
> **EVIDENCE**: Google TPU v6 cluster expansion in EMEA [Market Expansion, 2025-03-05]. Microsoft Copilot enterprise revenue uplift [Product Update, 2025-02-28]. NVIDIA photonics acquisition for chip interconnects [Strategic Investment, 2025-03-12].
>
> **PREDICTION**: Companies without a custom silicon or enterprise AI story will face significant positioning pressure in H2 2025.

That pattern wasn't in any single signal. It emerged from temporal analysis across accumulated history. This is what happens when you give an AI system real [agent memory](https://vectorize.io/what-is-agent-memory) — not just retrieval, but the ability to reason across everything it knows.

## Lessons Learned

**Memory architecture is not about databases — it's about how you think about the system.** Once I stopped treating Hindsight as a storage layer to optimize around and started designing everything to leverage semantic recall, the whole system became cleaner. The API routes are simple because they do one thing: move data into or out of the memory bank.

**Strict schema discipline compounds over time.** Enforcing `signal_type`, `competitor_name`, `event_date`, `summary`, and `entities` on every signal costs nothing upfront. It becomes invaluable when you have hundreds of signals and need to reason about temporal patterns or filter by company. Bad structure early creates friction at scale.

**Groq error handling is not optional.** The system calls Groq twice per request — once for extraction, once for synthesis. Rate limits and malformed responses happen. Exponential backoff with three retry attempts (`[1000, 2000, 4000]ms`) made the system stable under real load. Without it, a single timeout would surface as a user-facing error.

**The fallback prompt is a double-edged sword.** The query route includes a fallback that generates a strategic analysis from general knowledge when memory signals are sparse. This makes the system feel confident even with thin data — but it also means you can't easily tell when the agent is reasoning from memory versus making educated guesses. For a production system, that distinction needs to be explicit in the UI.

**Real-time ingestion changes user behavior.** Once users could ingest a signal and immediately ask about it in the same session, they started treating the system differently — less like a search tool, more like a briefing partner they were actively feeding information. That behavioral shift was not something I anticipated, and it's the most interesting product insight from building this.

The full implementation is built on [Hindsight](https://github.com/vectorize-io/hindsight) for memory, Groq for inference, and a straightforward Express API. The memory layer is what makes the difference — not the model, not the prompts. An agent that remembers is a fundamentally different product than one that doesn't.
