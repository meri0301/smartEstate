/**
 * Reports translation-catalogue problems.
 *
 *   pnpm --filter @smartestate/web i18n:check
 *
 * The same checks run as a unit test, so CI already fails on a broken
 * catalogue; this script exists to give a readable report while translating.
 */
import { checkCatalogue, formatProblems } from '../src/shared/i18n/catalogue.js';
import { LOCALES } from '../src/shared/i18n/locales.js';
import { NAMESPACES } from '../src/shared/i18n/resources.js';

const problems = checkCatalogue();

if (problems.length === 0) {
  console.info(
    `i18n: ${String(LOCALES.length)} locales × ${String(NAMESPACES.length)} namespaces are complete, parseable and plural-correct`,
  );
} else {
  console.error(`i18n: ${String(problems.length)} problem(s)\n`);
  console.error(formatProblems(problems));
  process.exitCode = 1;
}
