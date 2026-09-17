import heroPhoto from '../../assets/home/hero-house.jpg';
import marketAnalysis from '../../assets/home/step-market-analysis.png';
import propertyDetails from '../../assets/home/step-property-details.png';
import recommendation from '../../assets/home/step-recommendation.png';

/**
 * The landing page's artwork, exported from the Figma file.
 *
 * Imported rather than served from `public/` so the bundler fingerprints each
 * file for caching and, more usefully, so a rename fails the build instead of
 * shipping a hole in the page.
 *
 * None of them is an `<img>`, because all of them are decorative — the headline
 * and the step headings carry the meaning, so none needs alternative text. The
 * photograph is a background; the drawings are masks, which is what lets them
 * be painted in the ink of whatever card they sit on instead of staying the
 * black they were drawn in and disappearing when the theme goes dark.
 */
export const HERO_PHOTO = heroPhoto;

/**
 * One line drawing per step of the "how it works" sequence.
 *
 * Each carries the aspect of the file it points at, because a mask has to be
 * given a box and the box has to be the drawing's own shape — `contain` inside
 * a fixed height would render the three at different scales, since the house
 * was exported on the card's canvas and the other two were cropped to their
 * ink. Re-export at a different aspect and the drawing letterboxes rather than
 * distorts, which is the failure worth having.
 */
export const STEP_ARTWORK = {
  details: { src: propertyDetails, aspectRatio: '548 / 311' },
  analyse: { src: marketAnalysis, aspectRatio: '440 / 166' },
  recommend: { src: recommendation, aspectRatio: '550 / 325' },
} as const;

/** `url()` for a background or mask, quoted so a path with spaces still parses. */
export function cssUrl(url: string): string {
  return `url("${url}")`;
}
