/** Pairing accepts only the company landing page, never an arbitrary return URL. */
export function parsePairingSearch(search: Record<string, unknown>): { next?: "/company" } {
  return search.next === "/company" ? { next: "/company" } : {};
}
