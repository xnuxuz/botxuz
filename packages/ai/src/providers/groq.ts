import {
  type CompletionRequest,
  type CompletionResponse,
  type LlmProvider,
  LlmRateLimitError,
  LlmUnavailableError,
  type ToolCall,
} from '../provider.js';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export type GroqOptions = {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
};

/**
 * Groq memakai API yang kompatibel OpenAI, jadi cukup fetch — tidak perlu SDK
 * tambahan yang menambah berat image Docker.
 */
export function createGroqProvider(options: GroqOptions): LlmProvider {
  const model = options.model ?? 'llama-3.3-70b-versatile';
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    name: 'groq',

    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
          })),
          ...(request.tools?.length
            ? {
                tools: request.tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                })),
                tool_choice: 'auto',
              }
            : {}),
        }),
      }).catch((error: unknown) => {
        throw new LlmUnavailableError('groq', error);
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        throw new LlmRateLimitError(
          'groq',
          Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
        );
      }

      if (!response.ok) {
        throw new LlmUnavailableError('groq', await response.text());
      }

      const body = (await response.json()) as GroqChatResponse;
      const choice = body.choices?.[0]?.message;

      const toolCalls: ToolCall[] = (choice?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: safeParseArguments(call.function.arguments),
      }));

      return {
        text: choice?.content ?? null,
        toolCalls,
        usage: body.usage
          ? {
              inputTokens: body.usage.prompt_tokens,
              outputTokens: body.usage.completion_tokens,
            }
          : undefined,
      };
    },
  };
}

function safeParseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
};
