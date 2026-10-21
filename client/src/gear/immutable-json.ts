const parsed = new WeakMap<ArrayBuffer, unknown>();
const decoder = new TextDecoder();

/** Reuse JSON from verified, immutable payload bytes without retaining evicted buffers.
 * Callers must verify the payload first and never rewrite its ArrayBuffer.
 * Presentation state belongs to actors; this shared source data is deeply frozen.
 */
export function parseImmutableJson(bytes: ArrayBuffer): any {
  if (parsed.has(bytes)) return parsed.get(bytes);
  const value: unknown = JSON.parse(decoder.decode(bytes));
  const pending: unknown[] = [value];
  while (pending.length) {
    const part = pending.pop();
    if (part === null || typeof part !== 'object') continue;
    for (const child of Object.values(part)) {
      if (child !== null && typeof child === 'object') pending.push(child);
    }
    Object.freeze(part);
  }
  // Parse/freeze failures never become a cached success.
  parsed.set(bytes, value);
  return value;
}
