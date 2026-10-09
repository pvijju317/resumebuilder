import { AppError } from '@tailor/shared';
import type { AiEnv, ProviderId } from '@tailor/shared/env';
import type { LLMProvider } from '../types.js';
import { anthropic } from './anthropic.js';
import { openaiCompatible } from './openai-compatible.js';

export function createProvider(id: ProviderId, env: AiEnv): LLMProvider {
  const missing = () =>
    new AppError('AI_UNAVAILABLE', `AI provider "${id}" is not configured`, 503);
  switch (id) {
    case 'nvidia':
      if (!env.NVIDIA_API_KEY) throw missing();
      return openaiCompatible('nvidia', env.NVIDIA_BASE_URL, env.NVIDIA_API_KEY);
    case 'deepinfra':
      if (!env.DEEPINFRA_API_KEY) throw missing();
      return openaiCompatible('deepinfra', env.DEEPINFRA_BASE_URL, env.DEEPINFRA_API_KEY);
    case 'openrouter':
      if (!env.OPENROUTER_API_KEY) throw missing();
      return openaiCompatible('openrouter', env.OPENROUTER_BASE_URL, env.OPENROUTER_API_KEY);
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) throw missing();
      return anthropic(env.ANTHROPIC_API_KEY);
    default:
      throw missing();
  }
}

export { anthropic, openaiCompatible };
