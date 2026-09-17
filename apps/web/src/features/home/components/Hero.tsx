import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Heading } from '../../../shared/ui/index.js';
import { HERO_PHOTO, cssUrl } from '../assets.js';
import { CtaLink } from './CtaLink.js';

/**
 * The hero: a photograph with the headline notched into its top-left corner and
 * the call to action into its bottom-right.
 *
 * The design achieves the notches with a mask on the image. They are built here
 * as page-coloured padding around each lime block instead, which reads
 * identically, survives a change of theme without a second mask, and keeps the
 * photograph a plain rectangle that any `object-fit` can crop.
 *
 * Below `md` the composition unstacks into document order — headline, image,
 * button — because the overlap needs width to be legible and a notch on a phone
 * is just a cropped headline.
 */
export function Hero(): JSX.Element {
  const { t } = useTranslation(['home', 'common']);

  return (
    <section className="relative mt-8 md:mt-12">
      {/*
        The headline. `common:tagline` is the product's one-line question and is
        already translated; the design's second line continues it rather than
        repeating it, so the two are composed here instead of being duplicated
        into this namespace.
      */}
      <div className="md:absolute md:start-0 md:top-0 md:z-10 md:w-[72%] md:rounded-ee-md md:bg-bg md:pb-3 md:pe-3">
        <div className="rounded-md bg-accent px-6 py-6 md:px-10 md:py-8">
          {/*
            24px on a phone and 32px from `md`. Armenian compounds are long and
            set uppercase here: at the desktop size, ԲԱՆԱԿԱՆՈՒԹՅԱՄԲ alone
            overruns a 375px viewport, so the size steps down and any word that
            still cannot fit breaks rather than escaping the block.
          */}
          <Heading
            as="h1"
            size="md"
            tone="onAccent"
            className="break-words leading-snug md:text-2xl"
          >
            <span className="block">{t('common:tagline')}</span>
            <span className="block">{t('home:hero.headline')}</span>
          </Heading>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 aspect-[4/3] w-full rounded-md rounded-tr-lg bg-surface-muted bg-cover bg-center md:mt-0 md:aspect-[1120/628]"
        style={{ backgroundImage: cssUrl(HERO_PHOTO) }}
      />

      <div className="mt-4 md:absolute md:bottom-0 md:end-0 md:mt-0 md:rounded-ss-md md:bg-bg md:ps-3 md:pt-3">
        <CtaLink to="listings" size="lg" className="w-full md:w-[22rem]">
          {t('home:hero.cta')}
        </CtaLink>
      </div>
    </section>
  );
}
