# Competitive Intelligence Agent

An AI-powered competitive intelligence platform that transforms raw market signals into actionable strategic insights using a memory-first architecture, a four-agent parallel reasoning pipeline, and real-time streaming responses.

Built for the **Vectorize Hindsight Hackathon**.

---

## Overview

Most competitive intelligence tools are stateless. Ask a question today, ask it again tomorrow — the system has no memory of what it already knows. Every answer is generated from scratch.

This agent is different. Every competitor signal — pricing changes, product launches, strategic hires, messaging shifts — is stored as a structured memory in [Hindsight](https://github.com/vectorize-io/hindsight). When you ask a question, the system recalls the 10–15 most semantically relevant signals, routes them through four specialized agents running in parallel, and streams back a cited intelligence brief.

The system compounds. Q&A interactions are written back into memory, so future queries benefit from the reasoning of past ones.

---

## Key Features

- **Persistent memory** — Every signal is stored in Hindsight and recalled by semantic meaning, not keyword match
- **Multi-agent intelligence pipeline** — Four specialized agents (Pricing, Hiring, Feature, Expansion) run in parallel and synthesize findings
- **Real-time signal ingestion** — Paste any raw text; Groq extracts a structured signal and writes it to memory instantly
- **Pattern detection** — Automatically identifies recurring competitor behaviors across the full signal history
- **Streaming AI responses** — NDJSON streaming with immediate header flush; tokens render as they arrive
- **Self-improving feedback loop** — Every Q&A pair is written back to Hindsight, refining future recall
- **Structured strategic insights** — Every answer follows a four-section format: SUMMARY, KEY MOVES, STRATEGIC IMPACT, RECOMMENDATION

---

## Architecture

```
Raw Text
   │
   ▼
[POST /ingest]
Groq extracts structured signal
(competitor_name, signal_type, summary, event_date, entities)
   │
   ▼
[Hindsight — writeSignal()]
Signal stored as memory with metadata
   │
   ▼
[POST /query/stream]
Hindsight recalls 10–15 high-confidence signals
   │
   ▼
[Signal Clustering]
Signals bucketed by type → pricing / hiring / feature / expansion
   │
   ▼
[Multi-Agent Pipeline — Promise.all]
Pricing Agent ──┐
Hiring Agent  ──┤──► 4 parallel Groq calls (120 tokens each, 8s timeout)
Feature Agent ──┤
Expansion Agent─┘
   │
   ▼
[Synthesis — streamGroq()]
Agent findings + grouped signals → SYNTHESISE_SYSTEM prompt
Streamed token-by-token to client
   │
   ▼
[Feedback Loop — writeSignal()]
Q&A pair written back to Hindsight memory
```

**Components:**

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Memory | Hindsight (Vectorize) — `retain()` + `recall()` |
| LLM | Groq — Llama 3.3 70B Versatile |
| Frontend | Vanilla HTML5 + CSS3 + JavaScript |
| Streaming | NDJSON over HTTP keep-alive |

---

## Multi-Agent System

The query pipeline routes recalled signals through four specialized agents that run in parallel via `Promise.all`. No agent blocks another.

### Signal Clustering

When a question arrives, the system recalls 10–15 signals from Hindsight and clusters them by `signal_type`:

| Agent | Signal Types |
|---|---|
| Pricing Agent | `pricing` |
| Hiring Agent | `hiring` |
| Feature Agent | `feature` |
| Expansion Agent | `pr`, `messaging`, `review`, `general` |

Each bucket is sorted by recency and capped at 4 signals. If any bucket falls below 2 signals, a redistribution pass fills it from unassigned signals — every agent gets meaningful input without duplication.

### Parallel Execution

```javascript
const [pricingOut, hiringOut, featureOut, expansionOut] = await Promise.all([
  runAgent("pricing",   buckets.pricing,   question),
  runAgent("hiring",    buckets.hiring,    question),
  runAgent("feature",   buckets.feature,   question),
  runAgent("expansion", buckets.expansion, question),
]);
```

Each agent returns a 1–2 sentence domain-specific finding. Outputs are filtered for non-null results, then passed to the synthesis layer.

### Final Synthesis

Agent findings are prepended to a structured synthesis prompt. The synthesizer sees both the raw signals (grouped by type) and the agent analysis, producing a four-section brief with inline citations like `[pricing, 2025-01]`.

### Pattern Queries

Questions containing keywords like `"trend"`, `"recurring"`, `"predict"`, or `"history"` are detected by `isPatternQuery()` and routed to a dedicated pattern prompt that identifies recurring competitor behaviors across the full recalled signal set, bypassing the multi-agent pipeline.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest` | Extract a structured signal from raw text and store in Hindsight |
| `POST` | `/query` | Non-streaming query — returns full answer as JSON |
| `POST` | `/query/stream` | Streaming query — NDJSON token stream with multi-agent pipeline |
| `POST` | `/seed` | Load all 30 signals from `data/fixtures.json` into Hindsight |
| `POST` | `/reset` | Delete and recreate the Hindsight memory bank |
| `GET` | `/signals` | List recent signals recalled from memory |
| `GET` | `/analytics/stats` | KPI summary: total signals, active competitors, patterns detected |
| `GET` | `/analytics/timeline` | Chronological signal timeline |
| `GET` | `/analytics/patterns` | LLM-identified recurring strategic patterns |
| `GET` | `/analytics/predictions` | Forward-looking competitor move predictions |
| `GET` | `/health` | Service health check (Groq + Hindsight client status) |

Top-level aliases `/timeline`, `/patterns`, and `/predictions` redirect to their `/analytics/*` equivalents.

### Request / Response Examples

**POST /ingest**
```json
// Request
{ "text": "Meridian AI just cut its Pro tier price by 22% to $49/month" }

// Response
{
  "signal_id": "abc123",
  "summary": "Meridian AI cut Pro tier price by 22% to $49/month, targeting mid-market SaaS teams.",
  "signal_type": "pricing",
  "stored_at": "2025-03-20T10:00:00.000Z"
}
```

**POST /query/stream** (NDJSON)
```json
// Request
{ "question": "What pricing patterns do you see across competitors?" }

// Stream events
{"type":"status","content":"Analyzing intelligence signals..."}
{"type":"chunk","content":"PATTERN: All three competitors..."}
{"type":"done","answer":"...full answer...","signals_used":12,"is_pattern":true}
```

---

## Dataset

The seed dataset (`backend/data/fixtures.json`) contains **30 structured signals** across **3 competitors** and **6 signal types**.

| Competitor | Signals |
|---|---|
| Meridian AI | 10 |
| Stackflow | 10 |
| NovaDeploy | 10 |

**Signal types:** `pricing`, `feature`, `hiring`, `messaging`, `pr`, `review`

**Date range:** January 2025 – March 2025

Each signal includes: `competitor_name`, `signal_type`, `summary`, `event_date`, `entities`.

---

## Demo Flow

1. **Start** — Open `http://localhost:3001`. Dashboard shows zero counts.
2. **Seed** — Go to **Admin** → click **Load Demo Data**. All 30 signals are written to Hindsight.
3. **Dashboard** — Return to Dashboard. KPI counters update as the memory bank populates.
4. **Query** — Go to **Intelligence Chat**. Ask: *"What is Meridian AI's strategy for the next quarter?"*
5. **Observe** — The agent recalls 10–15 signals, runs four parallel agents, and streams a cited brief. The footer shows how many signals were recalled.
6. **Ingest** — Go to **New Analysis**. Paste: *"Stackflow just hired a Head of AI from OpenAI."*
7. **Loop** — Return to Chat. Ask: *"What hiring trends do you see across competitors?"* The agent now includes your new signal in its analysis.
8. **Patterns** — Ask: *"What recurring patterns do you see in competitor pricing behavior?"* The pattern detection route activates automatically.

---

## Setup

### Prerequisites

- Node.js v18+
- A [Groq API key](https://console.groq.com/keys)
- A [Vectorize Hindsight](https://app.vectorize.io) API key and instance URL

### Configuration

Create `backend/.env` (copy from `backend/.env.example`):

```env
PORT=3001
GROQ_API_KEY=your_groq_key_here
HINDSIGHT_API_KEY=your_hindsight_key_here
HINDSIGHT_INSTANCE_URL=https://your-instance.vectorize.io
```

The server validates all three keys on startup and exits with a clear error message if any are missing or still set to placeholder values.

### Install and Run

```bash
# Install all dependencies
npm install

# Start the server (serves both backend API and frontend)
npm run dev
```

The app is available at `http://localhost:3001`.

---

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js v18+ |
| Framework | Express 4 |
| LLM | Groq — `llama-3.3-70b-versatile` |
| Memory | `@vectorize-io/hindsight-client` |
| Streaming | NDJSON over HTTP keep-alive |
| Frontend | Vanilla HTML5, CSS3, JavaScript |
| Config | `dotenv` |

---

## Hackathon Alignment

### Memory Requirement
Every signal is stored in Hindsight via `hindsight.retain()` with structured metadata. Every query retrieves semantically relevant signals via `hindsight.recall()` with a budget parameter that scales with the number of signals needed. The system uses Hindsight as its primary intelligence layer — not a cache, not a database, but the reasoning substrate the agents operate over.

### Multi-Agent Reasoning
The query pipeline implements a genuine multi-agent architecture: four specialized agents cluster signals by domain, run in parallel with independent timeouts, and produce domain-specific findings that feed a synthesis layer. This is not a single LLM call with a long prompt — it is a coordinated pipeline where each agent has a defined role and bounded context.

### Real-World Problem
Competitive intelligence is a real, expensive problem for product and strategy teams. The system tracks three realistic competitors across six signal types, detects recurring behavioral patterns, and generates forward-looking predictions grounded in stored evidence — not hallucinated from general knowledge.

### Pattern Detection
The `isPatternQuery()` function detects temporal and behavioral questions and routes them to a dedicated pattern prompt. The pattern system identifies recurring competitor behaviors (e.g., pricing moves before product launches) across the full signal history and generates 60–90 day predictions with cited evidence.

---

## Project Structure

```
ci-agent/
├── backend/
│   ├── data/
│   │   └── fixtures.json          # 30 seed signals (3 competitors)
│   ├── lib/
│   │   ├── groq.js                # callGroq() + streamGroq()
│   │   └── hindsight.js           # writeSignal() + recallSignals()
│   ├── prompts/
│   │   ├── extract.js             # Signal extraction prompt
│   │   ├── pattern.js             # Pattern detection prompt + isPatternQuery()
│   │   └── synthesise.js          # Four-section synthesis prompt
│   ├── routes/
│   │   ├── analytics.js           # /stats, /timeline, /patterns, /predictions
│   │   ├── ingest.js              # POST /ingest
│   │   ├── query.js               # POST /query + /query/stream (multi-agent)
│   │   ├── reset.js               # POST /reset
│   │   ├── seed.js                # POST /seed
│   │   └── signals.js             # GET /signals
│   ├── server.js                  # Express app + startup validation
│   └── .env.example
└── frontend/
    ├── index.html
    ├── app.js
    └── style.css
```

---

*Built for the Vectorize Hindsight Hackathon. This is a real AI system — memory-driven, multi-agent, and production-structured.*
