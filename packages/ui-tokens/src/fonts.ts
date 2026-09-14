/**
 * Per-locale font plan.
 *
 * The design specifies Krona One for display and Montserrat for body, but the
 * product ships in Armenian, Russian and English, and neither face covers all
 * three scripts:
 *
 *   Krona One          latin, latin-ext                 weight 400 only
 *   Montserrat         latin, latin-ext, cyrillic       weights 100–900
 *   Noto Sans Armenian latin, latin-ext, armenian       weights 100–900
 *
 * So Armenian has no design face at all, and Russian has none for display.
 * Rather than let the browser silently substitute, each locale names the face
 * that actually contains its script, and picks a weight that reproduces the
 * visual weight of Krona One (which is heavy at weight 400).
 *
 * `styles/fonts.css` turns this table into `:lang()` rules.
 */
export interface LocaleFontPlan {
  readonly locale: 'hy' | 'ru' | 'en';
  readonly display: string;
  readonly displayWeight: string;
  readonly body: string;
  readonly rationale: string;
}

export const LOCALE_FONTS: readonly LocaleFontPlan[] = [
  {
    locale: 'en',
    display: "'Krona One'",
    displayWeight: '400',
    body: "'Montserrat'",
    rationale: 'Both design faces cover Latin, so English renders exactly as drawn.',
  },
  {
    locale: 'ru',
    display: "'Montserrat'",
    displayWeight: '700',
    body: "'Montserrat'",
    rationale:
      'Krona One has no Cyrillic. Montserrat Bold is the closest available geometric display weight and keeps headings in the same family as body copy.',
  },
  {
    locale: 'hy',
    display: "'Noto Sans Armenian'",
    displayWeight: '700',
    body: "'Noto Sans Armenian'",
    rationale:
      'Neither design face has Armenian. Noto Sans Armenian is the reference Armenian sans and ships the full 100–900 range, so Bold can stand in for the display role.',
  },
];
