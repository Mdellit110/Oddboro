// Turns text into a vector on this Mac, through Ollama's nomic-embed-text, so
// nothing written to the ledger leaves the machine. Returns null when Ollama is
// not running; the row is still written and found by its words.
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
export const EMBED_MODEL = 'nomic-embed-text';

/** `document` for text being stored, `query` for text being searched with. */
export async function embed(text: string, as: 'document' | 'query'): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA}/api/embed`, {
      method: 'POST',
      body: JSON.stringify({ model: EMBED_MODEL, input: `search_${as}: ${text}` })
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { embeddings?: number[][] };
    return body.embeddings?.[0] ?? null;
  } catch {
    return null;
  }
}
