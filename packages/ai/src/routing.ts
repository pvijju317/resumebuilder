import type { Tier } from '@tailor/shared';
import type { AiEnv, ProviderId } from '@tailor/shared/env';
import type { TaskDef } from './registry.js';

export interface Target {
  provider: ProviderId;
  model: string;
}

export interface Route {
  primary: Target;
  fallback: Target | null;
}

/**
 * Model ids may be written `provider:model` (e.g. `deepinfra:nvidia/Nemotron-…`) to target a
 * non-primary provider; otherwise the primary provider is used.
 */
export function parseTarget(spec: string, defaultProvider: ProviderId): Target {
  const m = /^(nvidia|deepinfra|openrouter|anthropic):(.+)$/.exec(spec);
  return m
    ? { provider: m[1] as ProviderId, model: m[2]! }
    : { provider: defaultProvider, model: spec };
}

/** Env-only routing (CLAUDE.md rule 9): AI_TASK_OVERRIDES > model class > tier. */
export function resolveRoute(
  task: TaskDef,
  env: AiEnv,
  opts: { tier?: Tier; modelOverride?: string } = {},
): Route {
  const premium =
    task.modelClass === 'PREMIUM' || (task.modelClass === 'BY_TIER' && opts.tier === 'premium');
  const spec =
    opts.modelOverride ??
    env.AI_TASK_OVERRIDES[task.name] ??
    (premium ? env.AI_MODEL_PREMIUM : env.AI_MODEL_STANDARD);
  const primary = parseTarget(spec, env.AI_PROVIDER_PRIMARY);

  let fallback: Target | null = null;
  const fbProvider = env.AI_PROVIDER_FALLBACK;
  const fbModel = premium ? env.AI_FALLBACK_MODEL_PREMIUM : env.AI_FALLBACK_MODEL_STANDARD;
  if (fbProvider && fbModel && !opts.modelOverride)
    fallback = { provider: fbProvider, model: fbModel };
  return { primary, fallback };
}
