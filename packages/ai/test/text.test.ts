import { describe, expect, it } from 'vitest';
import { extractJson, stripThink } from '../src/text.js';

describe('stripThink', () => {
  it.each([
    ['<think>plan</think>{"a":1}', '{"a":1}'],
    ['<THINK>x\ny</THINK>\n{"a":1}', '{"a":1}'],
    ['reasoning without open tag</think>{"a":1}', '{"a":1}'],
    ['{"a":1}<think>trailing unterminated', '{"a":1}'],
    ['{"a":1}', '{"a":1}'],
  ])('%j', (input, expected) => {
    expect(stripThink(input)).toBe(expected);
  });
});

describe('extractJson', () => {
  it('handles fences, prose and nested strings', () => {
    expect(extractJson('```json\n{"a":{"b":"}"}}\n```')).toBe('{"a":{"b":"}"}}');
    expect(extractJson('Here you go: {"a":"x\\"y"} thanks')).toBe('{"a":"x\\"y"}');
    expect(extractJson('[1,[2]] tail')).toBe('[1,[2]]');
  });

  it('returns null without a complete JSON value', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{"a": 1')).toBeNull();
  });
});
