/**
 * Turning a sentence into a full-text query that can actually match something.
 *
 * `websearch_to_tsquery` combines bare words with AND, which is right for a
 * search box people type two words into and wrong for the one here. "Quiet
 * bright flat near a school in Arabkir under 60 million" as an AND query asks
 * for a listing whose text contains all eleven words, and no listing ever will:
 * the arm returns nothing and the hybrid search quietly becomes a semantic
 * search with extra steps. That was the first thing to go wrong when this was
 * run against real data, and it went wrong silently.
 *
 * So the terms are joined with OR and `ts_rank` decides the order. Ranking is
 * what a rank function is for: it already rewards a document that matched more
 * of the terms, and more rarely-occurring ones, which is exactly the judgement
 * an AND query refuses to make.
 *
 * The terms are still handed to `websearch_to_tsquery` rather than to
 * `to_tsquery`, because the input is somebody's prose: `to_tsquery` raises a
 * syntax error on the first stray bracket, and turning user text into a query
 * language is how injection gets written.
 */

/**
 * Longest sequence of terms turned into a query.
 *
 * A sentence is short; anything past this is a paste. Each term costs an index
 * probe, so the bound is about keeping one request's work proportional to one
 * person's question.
 */
export const MAX_TERMS = 24;

/**
 * Terms are letters, digits and apostrophes, in any script.
 *
 * `\p{L}` rather than `[a-z]` because two of the three languages are not
 * written in the Latin alphabet, and a class that quietly dropped Armenian
 * would leave the lexical arm answering only in English and Russian.
 */
const TERM = /[\p{L}\p{N}'’]+/gu;

/**
 * Words that mean something to the websearch syntax.
 *
 * Passing a user's own "or" through would still parse, but their "and" would
 * bind two terms into a conjunction inside a query that is otherwise a
 * disjunction — one accidental AND in the middle of a sentence is enough to
 * empty the result set.
 */
const OPERATORS = new Set(['or', 'and', 'not']);

/**
 * The websearch query for a sentence, or `undefined` when there is nothing to ask.
 *
 * An empty result is not an empty query: a search for punctuation should return
 * nothing from this arm, not everything.
 */
export function toLexicalQuery(text: string): string | undefined {
  const terms: string[] = [];
  for (const match of text.matchAll(TERM)) {
    const term = match[0].toLowerCase();
    if (OPERATORS.has(term)) {
      continue;
    }
    terms.push(term);
    if (terms.length === MAX_TERMS) {
      break;
    }
  }
  return terms.length === 0 ? undefined : terms.join(' or ');
}
