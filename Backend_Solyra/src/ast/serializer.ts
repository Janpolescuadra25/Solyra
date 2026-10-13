import { createHash } from 'node:crypto';
import type { BoundedAstProgram } from '@solyra/shared';

function canonicalizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeValue((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export function canonicalizeJson(value: unknown): string {
  return canonicalizeValue(value);
}

export function hashCanonicalAst(program: BoundedAstProgram): string {
  return createHash('sha256').update(canonicalizeJson(program)).digest('hex');
}
