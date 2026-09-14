# 0008 — Internationalisation: locale in the URL, ICU messages, and a checked catalogue

**Status:** Accepted
**Date:** 2026-09-14

## Context

The product ships in Armenian, Russian and English, with Armenian as the default and English as
the fallback. The brief asks for locale-carrying routes, namespaced catalogues, ICU plurals,
`Intl` formatting, a language switcher, and a CI check that fails when a key exists in one
language and not another. It also warns that Russian has four plural categories and that
Armenian strings run long.

Two facts drove the design. First, the three languages disagree about plurals in ways a
two-form scheme cannot express: Russian needs `one`, `few`, `many` and `other`, and Armenian
selects the singular for zero, where English selects the plural. Second, the fonts already
differ per locale (ADR-0007), and the selector that drives them is `:lang()`, so whatever
chooses the language must also set `lang` on the document.

## Decision

1. **The locale lives in the URL**, as the first path segment: `/hy/listings/123`. A link can
   then be shared, bookmarked and indexed in the language it was written in, which a cookie or a
   header cannot offer. `/` and any locale-less path redirect to a detected locale.
2. **Detection order**: URL, then the signed-in account, then this browser's remembered choice,
   then `navigator.languages`, then Armenian. The URL wins so a shared link opens in its own
   language whatever the recipient's settings say. The resolver is a pure function that reports
   _which_ rule decided, so the behaviour is testable and explainable.
3. **An unsupported locale segment is replaced, not tolerated.** `/de/listings` becomes
   `/hy/listings` rather than rendering a half-translated page. Distinguishing an unsupported
   language tag from an ordinary path segment is done by shape, since the application has no
   two-letter route names.
4. **ICU MessageFormat**, through `i18next-icu`, rather than i18next's `_plural` key suffixes.
   The suffix scheme cannot express Russian and gets Armenian wrong; ICU defers to
   `Intl.PluralRules`, so every language gets the CLDR rules. `parseLngForICU` widens `hy` to
   `hy-AM` before the message reaches `Intl`, otherwise numbers and dates inside messages would
   use root conventions rather than Armenia's.
5. **Catalogues are namespaced per feature** and bundled rather than fetched: the whole set is a
   few kilobytes, and bundling removes the flash of untranslated keys on first paint. They are
   also typed, by declaring the English catalogue as i18next's resource shape, so a mistyped key
   fails `pnpm typecheck` instead of rendering the key to a user.
6. **The catalogue check goes beyond key parity.** It also parses every message and verifies that
   each plural block defines every category the language actually needs. Key parity alone would
   pass a Russian message copied from the English two-form shape, which is exactly the mistake
   the brief warns about. It runs as a unit test and as `pnpm i18n:check`.
7. **Formatting is `Intl`, wrapped and cached.** Dram is formatted with `currencyDisplay:
'narrowSymbol'` so it renders ֏ rather than the code, and the formatters are memoised because
   they are constructed per row of a result list.
8. **The rendered locale is published outside React** so the API client can send
   `Accept-Language`, keeping server-provided listing text in the same language as the interface
   without threading a parameter through every call.

## Consequences

- Every route gains a `:locale` segment, and links must be built relative to it; the switcher
  rewrites the current path rather than navigating home.
- Adding a language means adding a descriptor, a folder of catalogues, and a font decision.
  The catalogue check will then fail until every key is present with the right plural forms,
  which is the intended pressure.
- Translations are bundled, so the payload grows with the catalogue. Splitting to per-namespace
  dynamic imports is a contained change behind `resources.ts` when that becomes worthwhile.
- Server-rendered content still depends on the API honouring `Accept-Language`, which it does,
  with the query parameter taking precedence.
- Machine-translated listing text is already flagged by the API and has strings in the catalogue;
  surfacing that notice belongs with the listing screens.
