import { IntlMessageFormat } from 'intl-messageformat';
import { intlTag, LOCALES, type Locale } from './locales.js';
import { NAMESPACES, resources, type Namespace } from './resources.js';

/** A translatable value: nested objects of strings, as the JSON files are written. */
type CatalogueNode = string | { [key: string]: CatalogueNode };

/** Flattens `{ nav: { search: "…" } }` into `nav.search`. */
export function flatten(node: CatalogueNode, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === 'string') {
    out.set(prefix, node);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    for (const [k, v] of flatten(value, path)) {
      out.set(k, v);
    }
  }
  return out;
}

/** Every message in a locale, keyed `namespace:dotted.key`. */
export function catalogueFor(locale: Locale): Map<string, string> {
  const out = new Map<string, string>();
  for (const namespace of NAMESPACES) {
    const node = resources[locale][namespace] as CatalogueNode;
    for (const [key, value] of flatten(node)) {
      out.set(`${namespace}:${key}`, value);
    }
  }
  return out;
}

/** Index of the `}` that closes the `{` at `open`, or -1 if unbalanced. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') {
      depth += 1;
    } else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

export interface PluralBlock {
  /** Category names used, such as `one`, `few`, `other`, and explicit `=0`. */
  categories: Set<string>;
}

/**
 * Finds every `{count, plural, …}` block, including nested ones.
 *
 * A hand-written scan rather than the ICU parser: the parser is a transitive
 * dependency that is not part of this package's public surface, and the only
 * question asked here is which category names a block defines.
 */
export function pluralBlocks(message: string): PluralBlock[] {
  const blocks: PluralBlock[] = [];
  for (let i = 0; i < message.length; i += 1) {
    if (message[i] !== '{') {
      continue;
    }
    const close = matchBrace(message, i);
    if (close === -1) {
      break;
    }
    const inner = message.slice(i + 1, close);
    const [, type, ...rest] = inner.split(',');
    const kind = type?.trim();
    if (kind === 'plural' || kind === 'selectordinal') {
      const options = rest.join(',');
      const categories = new Set<string>();
      for (const match of options.matchAll(/(^|[\s}])(=\d+|zero|one|two|few|many|other)\s*\{/g)) {
        const name = match[2];
        if (name !== undefined) {
          categories.add(name);
        }
      }
      blocks.push({ categories });
      // Nested plurals live inside the option bodies.
      blocks.push(...pluralBlocks(options));
    }
    i = close;
  }
  return blocks;
}

export interface CatalogueProblem {
  locale: Locale;
  key: string;
  kind: 'missing' | 'extra' | 'syntax' | 'plural';
  detail: string;
}

/**
 * Checks one locale against the authoring language.
 *
 * Three failures are possible and all of them reach users as broken text:
 * a key present in one language and not another, a message ICU cannot parse,
 * and a plural block that omits a category the language actually needs —
 * Russian requires `few` and `many`, which a translator working from English
 * has no reason to add.
 */
export function checkLocale(locale: Locale, reference: Locale = 'en'): CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const referenceCatalogue = catalogueFor(reference);
  const catalogue = catalogueFor(locale);
  const required = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);

  for (const key of referenceCatalogue.keys()) {
    if (!catalogue.has(key)) {
      problems.push({
        locale,
        key,
        kind: 'missing',
        detail: `not translated (present in ${reference})`,
      });
    }
  }
  for (const key of catalogue.keys()) {
    if (!referenceCatalogue.has(key)) {
      problems.push({ locale, key, kind: 'extra', detail: `has no counterpart in ${reference}` });
    }
  }

  for (const [key, message] of catalogue) {
    try {
      new IntlMessageFormat(message, intlTag(locale));
    } catch (error) {
      problems.push({
        locale,
        key,
        kind: 'syntax',
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const block of pluralBlocks(message)) {
      const missing = [...required].filter((category) => !block.categories.has(category));
      if (missing.length > 0) {
        problems.push({
          locale,
          key,
          kind: 'plural',
          detail: `plural block is missing ${missing.join(', ')} for ${locale}`,
        });
      }
    }
  }

  return problems;
}

/** Checks every shipped locale. An empty array means the catalogue is sound. */
export function checkCatalogue(): CatalogueProblem[] {
  return LOCALES.flatMap((locale) => checkLocale(locale));
}

export function formatProblems(problems: readonly CatalogueProblem[]): string {
  return problems
    .map(
      (problem) =>
        `${problem.locale}  ${problem.kind.padEnd(7)} ${problem.key} — ${problem.detail}`,
    )
    .join('\n');
}

export type { CatalogueNode, Namespace };
