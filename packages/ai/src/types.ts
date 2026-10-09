/** TRD §5.1 provider abstraction. */
export interface CompletionRequest {
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature: number;
  /** Only sent when the provider/model profile declares structured-output support. */
  jsonSchema?: object;
  reasoning?: 'off' | 'low';
  timeoutMs: number;
}

export interface CompletionResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  raw: unknown;
}

export interface LLMProvider {
  id: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

/** Transport-level failure; `retryable` drives backoff and fallback. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    public readonly code: 'http' | 'timeout' | 'network' | 'empty',
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}
