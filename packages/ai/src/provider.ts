import { z } from 'zod';

/**
 * Satu interface untuk semua LLM. Ganti Groq <-> Gemini cukup lewat env,
 * tanpa menyentuh kode pemanggil (REQUIREMENT §8 — mitigasi free tier berubah).
 */

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCallId: z.string().optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Deklarasi function yang boleh dipanggil intent router. */
export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema untuk argumen — dihasilkan dari zod lewat z.toJSONSchema(). */
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
};

export type CompletionResponse = {
  text: string | null;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
};

export interface LlmProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Dilempar saat provider kena rate limit — pemanggil boleh fallback ke parser regex. */
export class LlmRateLimitError extends Error {
  constructor(
    provider: string,
    readonly retryAfterMs?: number,
  ) {
    super(`Provider ${provider} kena rate limit`);
    this.name = 'LlmRateLimitError';
  }
}

export class LlmUnavailableError extends Error {
  constructor(provider: string, cause?: unknown) {
    super(`Provider ${provider} tidak tersedia`);
    this.name = 'LlmUnavailableError';
    this.cause = cause;
  }
}
