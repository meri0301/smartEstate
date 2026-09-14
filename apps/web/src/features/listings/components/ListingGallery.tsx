import type { Media } from '@smartestate/contracts';
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, Text } from '../../../shared/ui/index.js';

export interface ListingGalleryProps {
  media: readonly Media[];
  /** Used as the alternative text of the large image, since the photos have no captions. */
  title: string;
}

/**
 * Photographs and floor plans.
 *
 * A large image with a strip of thumbnails, rather than a carousel: the whole
 * set stays visible and reachable with Tab, and there is no autoplay or hidden
 * content for a screen reader to miss. Videos are not shown here; the seed data
 * has none and a player is its own piece of work.
 */
export function ListingGallery({ media, title }: ListingGalleryProps): JSX.Element {
  const { t } = useTranslation('listings');
  const images = media.filter((item) => item.kind !== 'VIDEO');
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[Math.min(activeIndex, images.length - 1)];

  if (active === undefined) {
    return (
      <div className="grid aspect-[3/2] w-full place-items-center rounded-md bg-surface-muted">
        <Text tone="muted">{t('photoCount', { count: 0 })}</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <img
        src={active.url}
        alt={t('detail.photoOf', { title, index: activeIndex + 1, total: images.length })}
        className="aspect-[3/2] w-full rounded-md object-cover"
      />

      {images.length > 1 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('detail.gallery')}>
          {images.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={index === activeIndex}
                onClick={() => {
                  setActiveIndex(index);
                }}
                className={cn(
                  'block size-20 overflow-hidden rounded-sm border transition-colors duration-[var(--se-duration-fast)] ease-standard',
                  index === activeIndex
                    ? 'border-accent'
                    : 'border-border hover:border-border-interactive',
                )}
              >
                <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
