# Comp Intel Agent 🚀

**Comp Intel Agent** is a full-stack, AI-powered competitive intelligence platform designed for the modern enterprise. It transforms raw market "signals" into actionable strategic insights using a memory-first architecture.

Built with **Hindsight** for persistent memory and **Groq** for high-speed inference, the agent doesn't just store data—it learns from every interaction.

## 🌟 Core Features

-   **Intelligent Ingestion**: Extract structured intelligence (competitor names, dates, signal types) from raw text snippets using Llama-3 (Groq).
-   **Memory-First Recall**: Powered by Hindsight, the agent recalls relevant historical signals to answer complex strategic questions.
-   **Predictive Patterns**: Detects recurring competitor maneuvers (e.g., price drops before launch) with high confidence scoring.
-   **Self-Improving Feedback**: Q&A interactions are written back into memory, allowing the agent to refine its understanding over time.
-   **Executive Dashboard**: Real-time KPI cards and a comprehensive signals database with CSV export functionality.

## 🛠️ Technical Stack

-   **Engine**: Node.js & Express
-   **Memory**: [Vectorize Hindsight](https://vectorize.io) (Managed Memory Bank)
-   **LLM**: [Groq Cloud](https://console.groq.com) (Llama 3.3 70B)
-   **Frontend**: Vanilla HTML5, CSS3 (Tailwind-powered), and pure JavaScript (No heavy frameworks).

## 🚀 Getting Started

### 1. Prerequisites
-   Node.js (v18+)
-   A Groq API Key
-   A Hindsight API Key & Instance URL (Vectorize.io)

### 2. Configuration
Create a `backend/.env` file (copy from `backend/.env.example`):
```env
PORT=3001
GROQ_API_KEY=your_groq_key
HINDSIGHT_API_KEY=your_hindsight_key
HINDSIGHT_INSTANCE_URL=https://your-instance.vectorize.io
```

### 3. Installation
```bash
# In the project root
npm install

# Start the server (Backend + Frontend)
npm run dev
```

The app will be available at `http://localhost:3001` (or your local dev server port).

## 📊 Demo Narrative for Judges

1.  **Dashboard**: Start at the Market Intelligence Overview. Notice the live 0-count counters.
2.  **Seed Data**: Go to **Admin** and click **Load Demo Data**. This simulates months of historical tracking. 
3.  **Dynamic Updates**: Return to **Dashboard**. Watch the counts jump as the Hindsight bank populates.
4.  **Intelligence Chat**: Ask a complex question: *"What is Azure Dynamics' strategy for the EMEA region?"*
5.  **Citations**: Observe the AI providing specific signal summaries retrieved from memory.
6.  **Ingestion**: Go to **New Analysis**, paste a new signal (e.g., *"Velocity Systems just hired 10 AI researchers from Google"*). 
7.  **Loop**: Ask the chat about recent hiring trends. The agent will now include your new signal in its analysis.

---
*Created for the Vectorize Hindsight Hackathon.*
