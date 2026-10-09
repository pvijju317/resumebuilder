import {
  ProviderError,
  isRetryableStatus,
  type CompletionRequest,
  type CompletionResponse,
  type LLMProvider,
} from '../types.js';

interface MessagesResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Anthropic Messages API adapter — the Claude fallback (TRD §5.1). Phase 0 ships it as a stub:
 * wired and unit-tested against a mocked transport, not yet exercised against the live API.
 * Extended thinking is never enabled, so `reasoning` needs no mapping.
 */
export function anthropic(
  apiKey: string,
  baseUrl = 'https://api.anthropic.com/v1',
  fetchImpl: typeof fetch = fetch,
): LLMProvider {
  return {
    id: 'anthropic',
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: req.model,
            system: req.system,
            messages: req.messages,
            max_tokens: req.maxTokens,
            temperature: req.temperature,
          }),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch (e) {
        throw new ProviderError(`anthropic network error: ${String(e)}`, null, true, 'network');
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 500);
        throw new ProviderError(
          `anthropic HTTP ${res.status}: ${detail}`,
          res.status,
          isRetryableStatus(res.status) || res.status === 529,
          'http',
        );
      }
      const json = (await res.json()) as MessagesResponse;
      const text = (json.content ?? []).map((c) => c.text ?? '').join('');
      if (!text)
        throw new ProviderError('anthropic returned empty content', res.status, true, 'empty');
      return {
        text,
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        raw: json,
      };
    },
  };
}
