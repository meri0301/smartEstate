import type { JSX } from 'react';
import { Hero, HowItWorks, LandingHeader } from '../../features/home/index.js';

/**
 * The landing page.
 *
 * It carries its own header and its own content column rather than sitting
 * inside the app chrome, because the design gives it a different one: no
 * bordered bar, no search link, and a wordmark in mixed case. Everything the
 * app shell provides that is not chrome — the locale, the toast region, the
 * skip link — still comes from `LocaleLayout` above it.
 *
 * Only the sections the design's first screen defines are here. The valuation
 * form, the feature grid, the testimonials, the FAQ and the footer are the rest
 * of the same frame and arrive with their own data.
 */
export function HomePage(): JSX.Element {
  return (
    <>
      <LandingHeader />
      <main id="main" className="mx-auto max-w-content px-6 pb-20">
        <Hero />
        <HowItWorks />
      </main>
    </>
  );
}
