import type { ModelAccuracy } from '@smartestate/contracts';
import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useModelAccuracy } from '../../valuation/index.js';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatNumber } from '../../../shared/i18n/formatters.js';
import { Heading, Text } from '../../../shared/ui/index.js';

export const FAQ_ID = 'faq';

const HEADING_ID = 'faq-heading';

/** The questions whose answers are fixed prose, in the design's order after the first. */
const PLAIN_QUESTIONS = ['data', 'free', 'speed', 'account'] as const;

/**
 * The questions the design asks, answered from the system rather than about it.
 *
 * The first one is the reason this section needed care. The mockup answers "how
 * accurate is the AI?" with "typically within 5-10% of the final sale price",
 * which is wrong twice over: the model is trained on asking prices and the
 * catalogue holds no sale prices at all, and the real error is several times
 * larger. It is replaced by the cross-validation the model reports about
 * itself, fetched rather than typed, so it cannot go stale the next time
 * anything is retrained.
 *
 * `<details>` rather than a hand-built accordion. It opens and closes by
 * keyboard, is announced correctly without a single aria attribute, and works
 * before any JavaScript has run — none of which a div with an onClick gives
 * back for free.
 */
export function Faq(): JSX.Element {
  const { t } = useTranslation('home');
  const accuracy = useModelAccuracy();

  return (
    <section id={FAQ_ID} aria-labelledby={HEADING_ID} className="mt-16 scroll-mt-8 md:mt-20">
      <Heading as="h2" size="md" id={HEADING_ID}>
        {t('faq.title')}
      </Heading>

      <div className="mt-8 flex flex-col gap-3">
        <Entry question={t('faq.accuracy.question')} defaultOpen>
          <AccuracyAnswer accuracy={accuracy.data} />
        </Entry>

        {PLAIN_QUESTIONS.map((key) => (
          <Entry key={key} question={t(`faq.${key}.question`)}>
            <Text size="sm">{t(`faq.${key}.answer`)}</Text>
          </Entry>
        ))}
      </div>
    </section>
  );
}

/**
 * How well the model does, in its own numbers.
 *
 * The caveat is not a footnote. Someone asking how accurate a valuation is
 * almost always means "how close to what I would pay", and the honest answer is
 * that this system has never seen a price anybody paid.
 */
function AccuracyAnswer({ accuracy }: { accuracy: ModelAccuracy | undefined }): JSX.Element {
  const { t } = useTranslation('home');
  const locale = useCurrentLocale();

  const percent = (value: number): string =>
    formatNumber(value, locale, { style: 'percent', maximumFractionDigits: 1 });

  /*
    All three or none. A partial report would let the answer quote one figure
    and silently drop another, and the grouped error is exactly the one that
    would go missing — it is optional in the contract because an unmeasured
    model has none of them, not because it is safe to omit.
  */
  const figures =
    accuracy?.withinKnownDistrictsMape !== undefined &&
    accuracy.unseenDistrictMape !== undefined &&
    accuracy.intervalCoverage !== undefined
      ? {
          known: percent(accuracy.withinKnownDistrictsMape),
          unseen: percent(accuracy.unseenDistrictMape),
          coverage: percent(accuracy.intervalCoverage),
        }
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Text size="sm">
        {figures === undefined ? t('faq.accuracy.unmeasured') : t('faq.accuracy.measured', figures)}
      </Text>
      <Text size="sm">{t('faq.accuracy.caveat')}</Text>
      {accuracy !== undefined && (
        <Text size="xs" tone="muted">
          {t('faq.accuracy.trained', {
            rows: formatNumber(accuracy.trainingRows, locale),
            districts: formatNumber(accuracy.districtsCovered, locale),
            version: accuracy.modelVersion,
          })}
        </Text>
      )}
    </div>
  );
}

function Entry({
  question,
  defaultOpen = false,
  children,
}: {
  question: string;
  defaultOpen?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <details
      open={defaultOpen}
      className="se-disclosure group rounded-sm bg-surface-muted px-6 py-4"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <Heading as="h3" size="sm" transform="none">
          {question}
        </Heading>
        {/*
          Drawn rather than lettered: a "+" and a "−" in the body face are
          different widths and different heights, so the control shifts as it
          toggles. Two crossed lines do not.

          Open turns the upright through a quarter turn onto the crossbar
          instead of hiding it, so the plus becomes a minus by moving rather
          than by disappearing — which is the same thing the panel below is
          doing, and at the same speed.
        */}
        <span aria-hidden="true" className="shrink-0 text-text">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="size-5"
          >
            <path d="M5 12h14" />
            <path
              d="M12 5v14"
              className="origin-center transition-transform duration-[var(--se-duration-base)] ease-standard [transform-box:fill-box] group-open:rotate-90"
            />
          </svg>
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
