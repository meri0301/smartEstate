# 0007 — Design system: generated tokens, Tailwind v4, and multi-script typography

**Status:** Accepted
**Date:** 2026-09-14

## Context

The brief requires a token package emitted as CSS custom properties plus a Tailwind theme, a
primitive component library with a Storybook story per primitive shown in Armenian, Russian and
English, dark mode by token swap rather than duplicated styles, and no hard-coded colour values
in components.

Reading the Figma file produced two findings that shaped every decision below.

1. **The design is a light-only marketing landing page.** One frame, 1440 × 5048, with no dark
   theme, no drop shadows, no gradients, and no status colours beyond an amber used for rating
   stars. It contains no search, listing, comparison or advisor screens.
2. **No single face covers the three scripts.** Krona One, the display face, ships Latin and
   Latin Extended only — no Cyrillic and no Armenian. Montserrat, the body face, adds Cyrillic
   but not Armenian. Armenian, the default locale, therefore had no face at all.

## Decision

### Tokens

1. **TypeScript is the source of truth**, and `styles/tokens.css` is generated from it by
   `pnpm tokens:css`. CI regenerates and fails on a diff, the same pattern already used for the
   ERD and the OpenAPI document, so a value cannot exist in one representation and not the other.
2. **Every token records its provenance** as `figma` or `derived`, with a note giving the reason.
   Of 99 tokens, 39 were read from the design and 60 were derived. The distinction is data, not a
   comment, so the thesis can state exactly which decisions were the designer's and which were
   the implementer's, and the Storybook "Tokens" page renders the inventory directly.
3. **Theming is a variable swap.** `--se-*` properties carry the values; `[data-theme="dark"]`
   overrides the colour group only, and a `prefers-color-scheme` block applies the same overrides
   when no explicit choice has been made. `color-scheme` is set alongside so native controls follow.
4. **Tailwind consumes the variables, not the values**, via `@theme inline`, so utilities
   re-resolve when the theme changes. Breakpoints are the one exception and are emitted literally,
   because a media query cannot read a custom property.

### Accessibility corrections to the design

5. Three design values fail WCAG 2.1 AA and are **not** reproduced verbatim:
   - the placeholder grey `#B4B4B4` is 2.0:1 on the input fill, so a darker grey is used;
   - the amber `#F2B62A` is 1.8:1 on the page and cannot carry text, so it is kept as
     `rating` for star fills and a separate accessible `warning` is derived;
   - the hairline greys are below 3:1, so a `border-interactive` token is added for control
     boundaries, where the non-text contrast rule applies.
     The lime accent is also below 3:1 against the page, so it is only ever a fill with dark ink on
     top, never an outline or an icon on white. A test asserts every one of these ratios, in both
     themes, so a future change cannot quietly regress them.

### Typography

6. **Per-locale font selection**, expressed as `:lang()` rules over the family tokens:
   English keeps Krona One and Montserrat exactly as designed; Russian falls back to Montserrat
   Bold for display, since Krona One has no Cyrillic; Armenian uses Noto Sans Armenian for both
   roles. Weight is part of the substitution because Krona One is visually heavy at weight 400,
   so the substitutes use 700 to preserve the intended heft. Armenian and Cyrillic also get
   slightly looser display leading, because glyphs set solid at line-height 1 clip their
   diacritics. Selectors are attribute-based, so a Russian quotation inside an Armenian page
   still gets the right face.

### Components

7. **Tailwind plus CVA**, not CSS Modules: the design is systematic rather than bespoke, so
   utilities backed by `@theme` keep components free of literal values. A test scans the
   primitives for hex codes, colour functions and non-`--se-` custom properties and fails on any,
   which is the only way to enforce the brief's "no hard-coded hex" rule, since the values would
   otherwise hide inside class strings.
8. **The platform does the hard parts.** `Modal` is a native `<dialog>`, so the focus trap, the
   Escape handler, the inert background and the top layer are the browser's. `Select` is a native
   `<select>`, so keyboard behaviour and the mobile picker come for free. `Tabs` implements the
   WAI-ARIA pattern by hand because no element provides it.
9. **Storybook carries theme and locale as globals**, and each primitive has an `AllLanguages`
   story rendering the three languages side by side, with `lang` set so the real substituted font
   is exercised rather than a development fallback.

## Consequences

- Adding a colour means adding it to `tokens.ts`, regenerating, and satisfying the contrast test;
  there is no path that skips either step.
- Armenian and Russian headings do not look identical to the Figma file, because they cannot.
  The substitution is documented in `fonts.css`, in `src/fonts.ts` and in the typography story.
- The derived dark theme and the derived status colours are the implementer's work, and are
  labelled as such rather than presented as the design's.
- Screens that the design never covered — search, listing detail, comparison, the advisor — will
  be composed from these primitives, so they inherit the corrected contrast and the multi-script
  typography rather than repeating the landing page's problems.
