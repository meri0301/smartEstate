/**
 * How an answer that a language model could have produced was actually produced.
 *
 * Every AI feature reports this, and the list is shared rather than repeated so
 * that two features cannot drift into meaning different things by the same word.
 * `model` and `cache` mean a model wrote it; everything else names the reason
 * the deterministic path did, which is more useful to a reader and to the
 * evaluation chapter than a single "fallback" would be — a spent quota and a
 * model that answered nonsense are different problems with different fixes.
 */
import { z } from 'zod';

export const ANSWER_SOURCES = [
  /** A model was called and its answer was used. */
  'model',
  /** A previous model answer for the same prompt was reused. */
  'cache',
  /** No model is configured, or the rule-based provider is selected. */
  'no-provider',
  /** The free tier's minute or day allowance is spent. */
  'quota',
  /** The call failed, timed out, or was refused. */
  'error',
  /** The model answered, but not in a shape that could be trusted. */
  'invalid',
  /** The feature is switched off. */
  'disabled',
] as const;
export const answerSourceSchema = z.enum(ANSWER_SOURCES);
export type AnswerSource = z.infer<typeof answerSourceSchema>;
