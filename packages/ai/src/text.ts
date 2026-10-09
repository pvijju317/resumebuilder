/**
 * Defensive cleanup of model output (TRD §5.1): remove reasoning traces even when reasoning is
 * meant to be off, then locate the JSON payload.
 */
export function stripThink(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Trace without an opening tag (template already opened it): drop everything up to </think>.
  const close = out.search(/<\/think>/i);
  if (close !== -1) out = out.slice(close + '</think>'.length);
  // Unterminated trace: nothing after <think> is usable.
  const open = out.search(/<think>/i);
  if (open !== -1) out = out.slice(0, open);
  return out.trim();
}

/** Extract the first balanced JSON object/array, tolerating code fences and surrounding prose. */
export function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.search(/[[{]/);
  if (start === -1) return null;
  const open = body[start]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return body.slice(start, i + 1);
  }
  return null;
}
