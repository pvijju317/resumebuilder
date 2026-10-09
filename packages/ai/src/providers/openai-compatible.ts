import { profileFor } from '../model-profiles.js';
import {
  ProviderError,
  isRetryableStatus,
  type CompletionRequest,
  type CompletionResponse,
  type LLMProvider,
} from '../types.js';

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** NVIDIA NIM, DeepInfra and OpenRouter all speak the OpenAI chat-completions protocol. */
export function openaiCompatible(
  id: string,
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): LLMProvider {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return {
    id,
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const profile = profileFor(req.model);
      const body: Record<string, unknown> = {
        model: req.model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        stream: false,
        ...profile.reasoningParams(req.reasoning ?? 'off'),
      };
      if (req.jsonSchema && profile.structuredOutput) {
        body['response_format'] = {
          type: 'json_schema',
          json_schema: { name: 'output', schema: req.jsonSchema, strict: true },
        };
      }

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch (e) {
        const timeout =
          e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        throw new ProviderError(
          timeout
            ? `${id} timed out after ${req.timeoutMs}ms`
            : `${id} network error: ${String(e)}`,
          null,
          true,
          timeout ? 'timeout' : 'network',
        );
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 500);
        throw new ProviderError(
          `${id} HTTP ${res.status}: ${detail}`,
          res.status,
          isRetryableStatus(res.status),
          'http',
        );
      }

      const json = (await res.json()) as ChatCompletion;
      const text = json.choices?.[0]?.message?.content ?? '';
      if (!text) throw new ProviderError(`${id} returned empty content`, res.status, true, 'empty');
      return {
        text,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        raw: json,
      };
    },
  };
}
