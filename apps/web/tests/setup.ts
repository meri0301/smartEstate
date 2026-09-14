// Registers jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...) with Vitest.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library unmounts automatically only when Vitest runs with globals
 * enabled. This project keeps globals off so that every matcher and hook is
 * imported explicitly, so the teardown is wired by hand; without it, each test
 * would see the DOM left behind by the previous one.
 */
afterEach(() => {
  cleanup();
});
