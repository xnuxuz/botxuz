import {
  createGeminiEmbeddingProvider,
  createGroqProvider,
  type EmbeddingProvider,
  type LlmProvider,
} from '@xnuxuz/ai';
import { env } from '../../config/env.js';

/**
 * Provider dibuat malas dan boleh null: seluruh sistem harus tetap jalan tanpa
 * API key, dengan jalur deterministik sebagai penggantinya (§5.3).
 */
let llm: LlmProvider | null | undefined;
let embeddings: EmbeddingProvider | null | undefined;

export function getLlm(): LlmProvider | null {
  if (llm === undefined) {
    llm = env.GROQ_API_KEY ? createGroqProvider({ apiKey: env.GROQ_API_KEY }) : null;
  }
  return llm;
}

export function getEmbeddings(): EmbeddingProvider | null {
  if (embeddings === undefined) {
    embeddings = env.GEMINI_API_KEY
      ? createGeminiEmbeddingProvider({ apiKey: env.GEMINI_API_KEY })
      : null;
  }
  return embeddings;
}
