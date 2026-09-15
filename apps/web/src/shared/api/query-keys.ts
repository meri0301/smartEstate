/**
 * Hierarchical query keys. Invalidating `listings.all` drops every listing
 * query; `listings.detail(id)` targets one. Keys are plain data so they
 * serialise deterministically.
 */
export const queryKeys = {
  session: {
    me: ['session', 'me'] as const,
  },
  listings: {
    all: ['listings'] as const,
    search: (query: Record<string, unknown>) => ['listings', 'search', query] as const,
    detail: (idOrPublicId: string, locale?: string) =>
      ['listings', 'detail', idOrPublicId, locale ?? null] as const,
  },
  valuation: {
    all: ['valuation'] as const,
    forListing: (listingId: string) => ['valuation', listingId] as const,
  },
  geo: {
    districts: ['geo', 'districts'] as const,
    boundary: (slug: string) => ['geo', 'boundary', slug] as const,
  },
} as const;
