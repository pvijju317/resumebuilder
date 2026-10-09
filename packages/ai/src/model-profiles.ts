/**
 * Model-specific request flags, verified against model cards (CLAUDE.md rule 3).
 *
 * Nemotron 3 (Super/Ultra) — reasoning toggle is a chat-template kwarg:
 *   off: chat_template_kwargs { enable_thinking: false }
 *   low: chat_template_kwargs { enable_thinking: true, low_effort: true }
 *   Source: huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16 (checked 2026-10-09);
 *   IDs checked against https://integrate.api.nvidia.com/v1/models (2026-10-09).
 */
export interface ModelProfile {
  match: RegExp;
  reasoningParams(mode: 'off' | 'low'): Record<string, unknown>;
  /** Whether `response_format: json_schema` is honoured. Unverified models default to false. */
  structuredOutput: boolean;
}

const PROFILES: ModelProfile[] = [
  {
    match: /nemotron-3/i,
    reasoningParams: (mode) => ({
      chat_template_kwargs:
        mode === 'off' ? { enable_thinking: false } : { enable_thinking: true, low_effort: true },
    }),
    structuredOutput: false,
  },
];

const DEFAULT_PROFILE: ModelProfile = {
  match: /.*/,
  reasoningParams: () => ({}),
  structuredOutput: false,
};

export function profileFor(model: string): ModelProfile {
  return PROFILES.find((p) => p.match.test(model)) ?? DEFAULT_PROFILE;
}
