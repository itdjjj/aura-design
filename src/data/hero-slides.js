/**
 * Aura Design: data/hero-slides.js
 *
 * Content for the home page hero. Edit this file to change the rotating
 * headline words or the background photographs. No other code needs touching,
 * with one exception: index.html contains four slider dots and the text
 * "/ 04" in the counter, so keep exactly four slides here, or update those
 * two places in the markup to match.
 *
 * How hero.js uses it:
 *   - The first slide is already in the HTML (headline "quiet luxury" and
 *     /images/hero/hero-1.jpg), so the page is complete before JavaScript runs.
 *     Keep slide 1 identical to that markup.
 *   - Slides 2 to 4 load their background image lazily, just before they show.
 *   - Image files live in public/images/hero/ and are referenced from the
 *     site root (Vite serves public/ at "/").
 *
 * Image guidance: landscape photographs, about 2400 x 1600 px, JPEG or WebP,
 * under roughly 400 KB each, with the main subject away from the left third,
 * where the headline sits.
 */

/**
 * @typedef {Object} HeroSlide
 * @property {string} id           Stable identifier, used in code and analytics.
 * @property {string} phrase       Word or phrase completing "Interiors shaped by ...".
 * @property {Object} image        Background photograph.
 * @property {string} image.src    Path from the site root.
 * @property {number} image.width  Intrinsic width in pixels.
 * @property {number} image.height Intrinsic height in pixels.
 * @property {string} image.position CSS object-position, to keep the subject framed.
 */

/** @type {readonly HeroSlide[]} */
export const heroSlides = Object.freeze([
  Object.freeze({
    id: 'quiet-luxury',
    phrase: 'quiet luxury',
    image: Object.freeze({
      src: '/images/hero/hero-1.jpg',
      width: 2400,
      height: 1600,
      position: '50% 50%',
    }),
  }),
  Object.freeze({
    id: 'lived-in-elegance',
    phrase: 'lived-in elegance',
    image: Object.freeze({
      src: '/images/hero/hero-2.jpg',
      width: 2400,
      height: 1600,
      position: '50% 55%',
    }),
  }),
  Object.freeze({
    id: 'timeless-character',
    phrase: 'timeless character',
    image: Object.freeze({
      src: '/images/hero/hero-3.jpg',
      width: 2400,
      height: 1600,
      position: '60% 50%',
    }),
  }),
  Object.freeze({
    id: 'effortless-light',
    phrase: 'effortless light',
    image: Object.freeze({
      src: '/images/hero/hero-4.jpg',
      width: 2400,
      height: 1600,
      position: '40% 50%',
    }),
  }),
]);

/**
 * Timing for the slider, in milliseconds.
 *
 * intervalMs should match the --hero-interval value hero.js writes for the
 * progress bar on the dots (it derives that value from this number, so the
 * two cannot drift apart).
 *
 * textOutMs and textInMs match the text-out (0.6s) and text-in (0.8s)
 * animations defined in tailwind.config.js. backgroundFadeMs matches the
 * duration-[1400ms] crossfade on the hero images in index.html.
 */
export const heroSettings = Object.freeze({
  intervalMs: 5000,
  textOutMs: 600,
  textInMs: 800,
  backgroundFadeMs: 1400,
});