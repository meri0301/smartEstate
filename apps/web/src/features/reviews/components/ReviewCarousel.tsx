import type { Review } from '@smartestate/contracts';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Heading, Text } from '../../../shared/ui/index.js';

export interface ReviewCarouselProps {
  reviews: readonly Review[];
}

/**
 * The reviews, as a scroller rather than a rotating banner.
 *
 * Every review is in the document and reachable: the track is a real
 * horizontally scrollable list, so a reader can swipe it, scroll it with a
 * trackpad, tab through it, or press the buttons, and a screen reader meets all
 * of them in order. A carousel that swaps one slide for another would hide most
 * of the content from everything except a mouse, and would move on its own
 * while somebody was reading.
 *
 * The buttons scroll by one card rather than one page, because a page is a
 * different distance on every screen and a reader who presses "next" is looking
 * for the card they can half-see.
 */
export function ReviewCarousel({ reviews }: ReviewCarouselProps): JSX.Element {
  const { t } = useTranslation('home');
  const track = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const element = track.current;
    if (element === null) {
      return;
    }
    // A fractional scroll width is normal at fractional zoom levels, so the
    // end test needs a pixel of slack or the button never enables.
    const maxScroll = element.scrollWidth - element.clientWidth;
    setAtStart(element.scrollLeft <= 1);
    setAtEnd(element.scrollLeft >= maxScroll - 1);
  }, []);

  useEffect(() => {
    sync();
  }, [sync, reviews]);

  const scrollByCard = (direction: 1 | -1): void => {
    const element = track.current;
    const first = element?.firstElementChild;
    if (element === null || first === undefined || first === null) {
      return;
    }
    element.scrollBy({ left: direction * (first.clientWidth + CARD_GAP), behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-4">
      <ul
        ref={track}
        onScroll={sync}
        tabIndex={0}
        aria-label={t('reviews.carousel')}
        className="-mx-1 flex snap-x snap-mandatory gap-7 overflow-x-auto scroll-smooth px-1 pb-2"
      >
        {reviews.map((review) => (
          <Card
            as="li"
            key={review.id}
            tone="muted"
            padding="lg"
            className="flex w-[17rem] shrink-0 snap-start flex-col gap-4 sm:w-[19rem]"
          >
            {/*
              The quote carries the language it was written in, so a screen
              reader pronounces an Armenian review in Armenian on the English
              page. A review is prose and cannot be machine translated without
              putting words in its author's mouth.
            */}
            <Text as="div" size="sm" lang={review.locale}>
              <q>{review.body}</q>
            </Text>
            <div className="mt-auto flex flex-col gap-0.5">
              <Heading as="h3" size="sm">
                {review.authorName}
              </Heading>
              <Text size="xs" tone="muted">
                {t(`reviews.role.${review.authorRole}`)}
              </Text>
            </div>
          </Card>
        ))}
      </ul>

      {reviews.length > 1 && (
        <div className="flex gap-2">
          <ScrollButton
            label={t('reviews.previous')}
            disabled={atStart}
            onClick={() => {
              scrollByCard(-1);
            }}
            path="m14 6-6 6 6 6"
          />
          <ScrollButton
            label={t('reviews.next')}
            disabled={atEnd}
            onClick={() => {
              scrollByCard(1);
            }}
            path="m10 6 6 6-6 6"
          />
        </div>
      )}
    </div>
  );
}

/** Matches the `gap-7` on the track, so one press moves exactly one card. */
const CARD_GAP = 28;

function ScrollButton({
  label,
  disabled,
  onClick,
  path,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  path: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-full border border-border-interactive text-text transition-colors duration-[var(--se-duration-fast)] ease-standard hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-5"
      >
        <path d={path} />
      </svg>
    </button>
  );
}
