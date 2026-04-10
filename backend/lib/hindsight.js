const { HindsightClient } = require("@vectorize-io/hindsight-client");

/**
 * The memory bank ID used for all CI Agent signals.
 * All signals are stored in and recalled from this single bank.
 */
const BANK_ID = "ci-agent";

let client = null;

/**
 * Lazily initialize and return the HindsightClient.
 * Uses HINDSIGHT_INSTANCE_URL as baseUrl and HINDSIGHT_API_KEY for auth.
 * @returns {HindsightClient}
 */
function getClient() {
  if (!client) {
    client = new HindsightClient({
      baseUrl: process.env.HINDSIGHT_INSTANCE_URL,
      apiKey: process.env.HINDSIGHT_API_KEY,
    });
  }
  return client;
}

/**
 * Write a competitive intelligence signal to Hindsight memory.
 * Content is formatted as: "[signal_type] competitor_name: summary"
 *
 * @param {Object} signal - The signal object to store.
 * @param {string} signal.signal_type - Type of signal (pricing|feature|hiring|messaging|pr|review).
 * @param {string} signal.competitor_name - Name of the competitor.
 * @param {string} signal.summary - Short summary of the signal.
 * @param {string|null} [signal.event_date] - Optional ISO event date.
 * @param {string[]} [signal.entities] - Optional associated entities.
 * @param {string} [signal.stored_at] - Timestamp when signal was created.
 * @returns {Promise<Object>} - The stored signal result from Hindsight.
 */
async function writeSignal(signal) {
  const hindsight = getClient();

  // Format the content string as specified
  const content = `[${signal.signal_type}] ${signal.competitor_name}: ${signal.summary}`;

  // Store signal metadata alongside the content
  const metadata = {
    signal_type: signal.signal_type,
    competitor_name: signal.competitor_name,
    event_date: signal.event_date || null,
    entities: signal.entities || [],
    stored_at: signal.stored_at || new Date().toISOString(),
  };

  const result = await hindsight.retain(BANK_ID, content, {
    metadata,
    timestamp: signal.event_date ? new Date(signal.event_date) : new Date(),
    context: `Competitive signal for ${signal.competitor_name}`,
  });

  return result;
}

/**
 * Retrieve relevant signals from Hindsight via semantic search.
 *
 * @param {string} query - The natural language query to match against.
 * @param {number} topK - Number of top results to return (default 5).
 * @returns {Promise<Object[]>} - Array of matching memory objects from Hindsight.
 */
async function recallSignals(query, topK = 5) {
  const hindsight = getClient();

  const result = await hindsight.recall(BANK_ID, query, {
    budget: topK > 10 ? "high" : "mid",
  });

  // The recall result may be nested under memories or similar key
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.memories)) return result.memories;
  if (result && Array.isArray(result.results)) return result.results;

  return [];
}

module.exports = { writeSignal, recallSignals, BANK_ID };
