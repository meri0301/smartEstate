import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Heading, Text, cn } from '../../../shared/ui/index.js';
import { STEP_ARTWORK, cssUrl } from '../assets.js';
import { HOW_IT_WORKS_ID } from './LandingHeader.js';

/** Names the section for assistive technology, so it is reachable as a region. */
const HEADING_ID = 'how-it-works-heading';

interface StepProps {
  title: string;
  body: string;
  artwork: (typeof STEP_ARTWORK)[keyof typeof STEP_ARTWORK];
  /** The lime card needs its own ink, because the accent stays lime on dark. */
  tone: 'muted' | 'accent';
  className?: string;
}

/**
 * The three steps, in the arrangement the design gives them: two stacked cards
 * on the left and one tall card on the right.
 *
 * The cards are written out here rather than built from the shared `Card`
 * because the design's landing cards differ from the app's in every variant
 * that matters — a solid accent fill instead of the tinted one, 40px of padding
 * instead of 24, and artwork anchored to the bottom edge.
 *
 * Document order is the order of the process — details, analysis,
 * recommendation — and the grid does the placing, so a screen reader hears the
 * steps in the order a reader would perform them even though the third card is
 * visually second from the left.
 */
export function HowItWorks(): JSX.Element {
  const { t } = useTranslation('home');

  return (
    <section
      id={HOW_IT_WORKS_ID}
      aria-labelledby={HEADING_ID}
      className="mt-16 scroll-mt-8 md:mt-20"
    >
      <Heading as="h2" size="md" id={HEADING_ID}>
        {t('howItWorks.title')}
      </Heading>

      <div className="mt-6 grid gap-7 md:mt-10 md:grid-cols-2">
        <Step
          tone="muted"
          artwork={STEP_ARTWORK.details}
          title={t('howItWorks.details.title')}
          body={t('howItWorks.details.body')}
          className="md:col-start-1 md:row-start-1"
        />
        <Step
          tone="accent"
          artwork={STEP_ARTWORK.analyse}
          title={t('howItWorks.analyse.title')}
          body={t('howItWorks.analyse.body')}
          className="md:col-start-1 md:row-start-2"
        />
        <Step
          tone="muted"
          artwork={STEP_ARTWORK.recommend}
          title={t('howItWorks.recommend.title')}
          body={t('howItWorks.recommend.body')}
          className="md:col-start-2 md:row-span-2 md:row-start-1"
        />
      </div>
    </section>
  );
}

function Step({ title, body, artwork, tone, className }: StepProps): JSX.Element {
  const onAccent = tone === 'accent';

  return (
    <article
      className={cn(
        'flex min-h-56 flex-col gap-3 rounded-md p-6 md:p-10',
        onAccent ? 'bg-accent' : 'bg-surface-muted',
        className,
      )}
    >
      <Heading as="h3" size="sm" tone={onAccent ? 'onAccent' : 'default'}>
        {title}
      </Heading>
      <Text size="sm" tone={onAccent ? 'onAccent' : 'default'}>
        {body}
      </Text>
      {/*
        The drawing is a mask filled with the card's ink rather than an image,
        so it is the colour of the text beside it in either theme. Drawn as an
        image it would stay the black it was exported in and all but vanish on
        the dark surface.
      */}
      <div
        aria-hidden="true"
        className={cn('mt-auto w-full', onAccent ? 'bg-on-accent' : 'bg-text')}
        style={{
          aspectRatio: artwork.aspectRatio,
          maskImage: cssUrl(artwork.src),
          maskRepeat: 'no-repeat',
          maskPosition: 'bottom',
          maskSize: 'contain',
          WebkitMaskImage: cssUrl(artwork.src),
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'bottom',
          WebkitMaskSize: 'contain',
        }}
      />
    </article>
  );
}
