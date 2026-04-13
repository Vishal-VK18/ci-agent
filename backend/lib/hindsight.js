const { HindsightClient } = require("@vectorize-io/hindsight-client");

/**
 * The memory bank ID used for all CI Agent signals.
 */
const BANK_ID = "ci-agent";

let client = null;

/** Placeholder values from .env.example that have not been replaced. */
const PLACEHOLDERS = new Set(["your_url_here", "your_key_here", "", undefined, null]);

/**
 * Validate a required env variable is set and not a placeholder.
 * Throws an actionable error with links to get real credentials.
 */
function assertEnv(name, value) {
  if (PLACEHOLDERS.has(value)) {
    throw new Error(
      `[Config] ${name} is not configured.\n` +
      `  Open d:\\ci-agent\\backend\\.env and replace the placeholder.\n` +
      `  Current value: "${value}"\n\n` +
      `  Where to get credentials:\n` +
      `    GROQ_API_KEY           → https://console.groq.com/keys\n` +
      `    HINDSIGHT_API_KEY      → https://app.vectorize.io  (Settings → API Keys)\n` +
      `    HINDSIGHT_INSTANCE_URL → https://app.vectorize.io  (Settings → Instance URL)`
    );
  }
}

/**
 * Lazily initialize and return the HindsightClient.
 * Validates env vars on first call and throws a clear, actionable error if
 * any required value is missing or still a placeholder.
 * @returns {HindsightClient}
 */
function getClient() {
  if (!client) {
    const instanceUrl = process.env.HINDSIGHT_INSTANCE_URL;
    const apiKey      = process.env.HINDSIGHT_API_KEY;

    // 1. Check variables are present and not placeholder
    assertEnv("HINDSIGHT_INSTANCE_URL", instanceUrl);
    assertEnv("HINDSIGHT_API_KEY",      apiKey);

    // 2. Check the URL is actually parseable
    try {
      new URL(instanceUrl);
    } catch {
      throw new Error(
        `[Config] HINDSIGHT_INSTANCE_URL is not a valid URL.\n` +
        `  Current value: "${instanceUrl}"\n` +
        `  Expected:       https://your-instance.vectorize.io\n` +
        `  Fix it at:      https://app.vectorize.io → Settings → Instance URL`
      );
    }

    console.log("[Hindsight] Initializing client...");
    console.log("[Hindsight] Using instance URL:", instanceUrl);
    console.log("[Hindsight] Using bank ID:", BANK_ID);

    client = new HindsightClient({ baseUrl: instanceUrl, apiKey });
  }
  return client;
}

/**
 * Write a competitive intelligence signal to Hindsight memory.
 * Content is formatted as: "[signal_type] competitor_name: summary"
 *
 * @param {Object}      signal
 * @param {string}      signal.signal_type     - pricing|feature|hiring|messaging|pr|review
 * @param {string}      signal.competitor_name
 * @param {string}      signal.summary
 * @param {string|null} [signal.event_date]    - Optional ISO date
 * @param {string[]}    [signal.entities]
 * @param {string}      [signal.stored_at]
 * @returns {Promise<Object>}
 */
async function writeSignal(signal) {
  const hindsight = getClient();

  const content  = `[${signal.signal_type}] ${signal.competitor_name}: ${signal.summary}`;
  // Store signal metadata alongside the content
  // Note: Hindsight retain() requires all metadata values to be strings
  const metadata = {
    signal_type:     signal.signal_type,
    competitor_name: signal.competitor_name,
    event_date:      signal.event_date  || '',                          // null → ''
    entities:        (signal.entities   || []).join(', '),              // array → string
    stored_at:       signal.stored_at   || new Date().toISOString(),
  };

  return await hindsight.retain(BANK_ID, content, {
    metadata,
    timestamp: signal.event_date ? new Date(signal.event_date) : new Date(),
    context:   `Competitive signal for ${signal.competitor_name}`,
  });
}

/**
 * Retrieve relevant signals from Hindsight via semantic search.
 *
 * @param {string} query - Natural language query to match against.
 * @param {number} topK  - Number of top results (default 5).
 * @returns {Promise<Object[]>}
 */
async function recallSignals(query, topK = 3) {
  const hindsight = getClient();

  const result = await hindsight.recall(BANK_ID, query, {
    budget: "low",   // "mid"/"high" retrieves the full bank (~79 signals) — too slow
    top_k: topK,
  });

  let signals;
  if (Array.isArray(result))                     signals = result;
  else if (result && Array.isArray(result.memories)) signals = result.memories;
  else if (result && Array.isArray(result.results))  signals = result.results;
  else signals = [];

  // Hard-cap regardless of what the client returns
  return signals.slice(0, topK);
}

module.exports = { writeSignal, recallSignals, getClient, BANK_ID };
