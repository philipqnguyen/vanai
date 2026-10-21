// The body templates used by the production character loader. Keep authoring
// coverage tied to these identities; legacy selectors do not add new bodies.
export const PRODUCTION_BODIES=['aedri-male','aedri-female','nym-male','nym-female','valdren-male','valdren-female','rasha-female','karrog-male'] as const;

export function isSupportedCharacterBody(body: string): boolean {
  return PRODUCTION_BODIES.some(supported => supported === body);
}
