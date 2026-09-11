import type { JSX } from 'react';

/**
 * Application root. Phase 0 renders the product name only; routing, providers
 * and error boundaries are added here in later phases. Intentionally unstyled:
 * design tokens arrive in Phase 4 and i18n in Phase 5.
 */
export function App(): JSX.Element {
  return (
    <main>
      <h1>SmartEstate</h1>
    </main>
  );
}
