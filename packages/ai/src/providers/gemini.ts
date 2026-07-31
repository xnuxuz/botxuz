import { type EmbeddingProvider, LlmUnavailableError } from '../provider.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiEmbeddingOptions = {
  apiKey: string;
  model?: string;
};

/**
 * Embedding untuk RAG episodic memory (fase 2). Dimensi 768 harus cocok dengan
 * definisi index vector di Redis Stack.
 */
export function createGeminiEmbeddingProvider(options: GeminiEmbeddingOptions): EmbeddingProvider {
  const model = options.model ?? 'text-embedding-004';

  return {
    name: 'gemini',
    dimensions: 768,

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const response = await fetch(
        `${GEMINI_BASE_URL}/models/${model}:batchEmbedContents?key=${options.apiKey}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: `models/${model}`,
              content: { parts: [{ text }] },
            })),
          }),
        },
      ).catch((error: unknown) => {
        throw new LlmUnavailableError('gemini', error);
      });

      if (!response.ok) {
        throw new LlmUnavailableError('gemini', await response.text());
      }

      const body = (await response.json()) as {
        embeddings?: Array<{ values: number[] }>;
      };

      return (body.embeddings ?? []).map((embedding) => embedding.values);
    },
  };
}
