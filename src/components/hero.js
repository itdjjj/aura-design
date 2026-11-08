/**
 * Aura Design: components/hero.js
 *
 * Behaviour for the home page hero: a parallax feel on scroll, and a rotating
 * headline word with matching background photographs.
 *
 * Markup it controls (all in index.html)
 *   [data-hero]               the hero section
 *   [data-parallax="0.25"]    layers that drift as the page scrolls. The number
 *                             is the speed: positive layers lag behind the
 *                             page (the background), negative layers move
 *                             faster than it (the floating frame).
 *   [data-hero-backgrounds]   holds the background photographs
 *   [data-hero-bg]            the first photograph, already in the HTML
 *   [data-hero-text]          the rotating headline word
 *   [data-hero-dots]          the slider dots (buttons with [data-hero-dot])
 *   [data-hero-counter]       the "01" in "01 / 04"
 *
 * Content comes from data/hero-slides.js: the phrases, the photographs and
 * the timing. Slide 1 is already in the HTML, so the page is complete before
 * this script runs.
 *
 * How the slider keeps time
 *   The progress bar inside the active dot is a CSS animation (components.css)
 *   that lasts one interval. When it finishes, the slider advances. So the bar
 *   people see and the real timing can never disagree, and pausing is just
 *   pausing that animation (data-paused on [data-hero-dots]).
 *
 * The slider pauses itself when
 *   - the pointer rests on the controls
 *   - keyboard focus is on the controls (mouse clicks do not count)
 *   - the hero is mostly scrolled out of view
 *   - the browser tab is hidden
 *   - the visitor presses the pause button (added by this script, next to the
 *     counter; automatic movement needs a way to stop it)
 *   - the visitor prefers reduced motion: then it never advances by itself,
 *     the pause button is hidden, and the dots still work by hand.
 *
 * Keyboard: the dots form a tab list. Tab reaches the selected dot, and the
 * arrow keys, Home and End move between them.
 *
 * Background photographs 2 to 4 are created here and downloaded just before
 * they are needed (the next one is fetched while the browser is idle). A
 * photograph that fails to load is skipped: the old background stays. Visitors
 * with Data Saver on keep the first photograph and still get the rotating text.
 */

import {
  createElement,
  delegate,
  html,
  on,
  qsa,
  render,
  setVisible,
  wait,
} from '../core/dom.js';
import { observeVisibility } from '../core/observer.js';
import { onScrollFrame } from '../core/scroll.js';
import { heroSettings, heroSlides } from '../data/hero-slides.js';


/* ==========================================================================
   Constants
   ========================================================================== */

/** Below this viewport width the parallax is halved, because phones scroll with momentum. */
const PARALLAX_REDUCED_BELOW = 768;
const PARALLAX_REDUCED_FACTOR = 0.5;

/** The slider counts as "in view" when this fraction of the hero is visible. */
const SLIDER_VISIBLE_THRESHOLD = 0.15;

/** Classes for the extra background photographs. They match the first one in index.html. */
const BACKGROUND_CLASSES =
  'absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-[1400ms] ease-in-out';

const CLASS_BG_VISIBLE = 'opacity-100';
const CLASS_BG_HIDDEN = 'opacity-0';
const CLASS_TEXT_IN = 'animate-text-in';
const CLASS_TEXT_OUT = 'animate-text-out';

const TOGGLE_CLASSES =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/40 text-white transition-colors duration-300 hover:bg-white hover:text-ink';

const PAUSE_ICON = html`<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>`;

const PLAY_ICON = html`<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"></path></svg>`;

/** @param {number} number */
const pad = (number) => String(number).padStart(2, '0');


/* ==========================================================================
   Parallax
   ========================================================================== */

/**
 * Moves every [data-parallax] layer as the hero scrolls away. The work runs
 * only while the hero is on screen and motion is allowed, and it shares the
 * single scroll loop from core/scroll.js.
 *
 * @param {HTMLElement} hero
 * @param {MediaQueryList} motion  The "prefers reduced motion" query.
 * @returns {() => void} Teardown function.
 */
function initParallax(hero, motion) {
  const layers = qsa('[data-parallax]', hero)
    .filter((element) => element instanceof HTMLElement)
    .map((element) => ({
      element: /** @type {HTMLElement} */ (element),
      speed: Number.parseFloat(/** @type {HTMLElement} */ (element).dataset.parallax ?? ''),
    }))
    .filter((layer) => Number.isFinite(layer.speed) && layer.speed !== 0);

  if (!layers.length) {
    return () => {};
  }

  /** @type {(() => void) | null} */
  let unsubscribe = null;
  let isVisible = true;

  /** @param {{ viewportWidth: number }} state */
  function update(state) {
    // How far the hero has scrolled up past the top of the window
    const rect = hero.getBoundingClientRect();
    const distance = Math.min(Math.max(-rect.top, 0), rect.height);
    const factor = state.viewportWidth < PARALLAX_REDUCED_BELOW ? PARALLAX_REDUCED_FACTOR : 1;

    layers.forEach(({ element, speed }) => {
      const shift = Math.round(distance * speed * factor * 10) / 10;
      element.style.transform = `translate3d(0, ${shift}px, 0)`;
    });
  }

  function reset() {
    layers.forEach(({ element }) => {
      element.style.transform = '';
    });
  }

  /** Starts or stops following the scroll, depending on visibility and motion. */
  function sync() {
    const shouldRun = isVisible && !motion.matches;

    if (shouldRun && !unsubscribe) {
      unsubscribe = onScrollFrame(update);
    } else if (!shouldRun && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    if (motion.matches) {
      reset();
    }
  }

  const stopVisibility = observeVisibility(hero, (visible) => {
    isVisible = visible;
    sync();
  });

  const stopMotion = on(motion, 'change', sync);

  sync();

  return function destroy() {
    unsubscribe?.();
    unsubscribe = null;
    stopVisibility();
    stopMotion();
    reset();
  };
}


/* ==========================================================================
   Headline and background slider
   ========================================================================== */

/**
 * @param {HTMLElement} hero
 * @param {MediaQueryList} motion  The "prefers reduced motion" query.
 * @returns {() => void} Teardown function.
 */
function initSlider(hero, motion) {
  const text = hero.querySelector('[data-hero-text]');
  const dotsElement = hero.querySelector('[data-hero-dots]');
  const counter = hero.querySelector('[data-hero-counter]');
  const backgrounds = hero.querySelector('[data-hero-backgrounds]');
  const firstBackground = hero.querySelector('[data-hero-bg]');
  const dots = qsa('[data-hero-dot]', hero).filter((dot) => dot instanceof HTMLElement);

  if (!(text instanceof HTMLElement) || !(dotsElement instanceof HTMLElement) || !dots.length) {
    console.warn('[Aura Design] The hero slider is missing markup and was not started.');
    return () => {};
  }

  if (dots.length !== heroSlides.length) {
    console.warn(
      `[Aura Design] The hero has ${dots.length} dots but data/hero-slides.js has ${heroSlides.length} slides. Using the smaller number.`,
    );
  }

  const total = Math.min(dots.length, heroSlides.length);

  // One slide has nothing to rotate to
  if (total < 2) {
    return () => {};
  }

  const slides = heroSlides.slice(0, total);
  const controls = dotsElement.parentElement ?? dotsElement;
  const saveData = Boolean(/** @type {any} */ (navigator).connection?.saveData);

  let current = 0;
  let destroyed = false;
  let pendingAdvance = false;
  let textToken = 0;
  let backgroundToken = 0;
  let layer = 0;

  /** Why the slider is not advancing right now. Empty means it is running. */
  const reasons = new Set();

  /** @type {Array<HTMLImageElement | null>} One entry per slide, null when it has no photograph. */
  const photos = slides.map(() => null);

  /** Photographs created by this script, removed again on teardown. */
  const createdPhotos = [];

  /** @type {Map<number, Promise<boolean>>} */
  const loading = new Map();


  /* ----- Setup ------------------------------------------------------------ */

  if (firstBackground instanceof HTMLImageElement) {
    firstBackground.style.objectPosition = slides[0].image.position;
    photos[0] = firstBackground;
  }

  if (backgrounds instanceof HTMLElement && !saveData) {
    slides.forEach((slide, index) => {
      if (index === 0) {
        return;
      }

      const photo = createElement('img', {
        className: BACKGROUND_CLASSES,
        attrs: {
          alt: '',
          width: slide.image.width,
          height: slide.image.height,
          decoding: 'async',
        },
        dataset: { heroBg: '' },
      });

      photo.style.objectPosition = slide.image.position;
      backgrounds.append(photo);

      photos[index] = /** @type {HTMLImageElement} */ (photo);
      createdPhotos.push(photo);
    });
  }

  dotsElement.style.setProperty('--hero-interval', `${heroSettings.intervalMs}ms`);
  dotsElement.dataset.paused = 'false';

  dots.forEach((dot, index) => {
    if (index >= total) {
      setVisible(dot, false);
      return;
    }

    dot.setAttribute('aria-label', `Show headline ${index + 1} of ${total}: ${slides[index].phrase}`);
    dot.setAttribute('aria-selected', String(index === 0));
    dot.tabIndex = index === 0 ? 0 : -1;
  });

  if (counter) {
    counter.textContent = pad(1);
  }


  /* ----- Pause button ----------------------------------------------------- */

  const toggle = createElement('button', {
    className: TOGGLE_CLASSES,
    attrs: { type: 'button', 'aria-label': 'Pause headline rotation' },
  });

  /** Which icon is drawn now, so the button is only redrawn when it changes. */
  let drawnPaused = null;

  function updateToggle() {
    const userPaused = reasons.has('user');

    if (drawnPaused !== userPaused) {
      drawnPaused = userPaused;
      render(toggle, userPaused ? PLAY_ICON : PAUSE_ICON);
      toggle.setAttribute(
        'aria-label',
        userPaused ? 'Play headline rotation' : 'Pause headline rotation',
      );
    }

    // With reduced motion nothing moves by itself, so there is nothing to pause
    setVisible(toggle, !reasons.has('reduced'));
  }

  controls.append(toggle);


  /* ----- Pausing ---------------------------------------------------------- */

  /**
   * Adds or removes a reason for being paused. When the last reason goes and
   * an advance was held back, it happens now.
   *
   * @param {string} reason
   * @param {boolean} active
   */
  function setReason(reason, active) {
    if (reasons.has(reason) === active) {
      return;
    }

    if (active) {
      reasons.add(reason);
    } else {
      reasons.delete(reason);
    }

    dotsElement.dataset.paused = String(reasons.size > 0);
    updateToggle();

    if (!reasons.size && pendingAdvance) {
      pendingAdvance = false;
      advance();
    }
  }


  /* ----- Headline text ---------------------------------------------------- */

  /**
   * Slides the old word out and the new one in. A newer call cancels an older
   * one that is still running (the token no longer matches).
   *
   * @param {string} phrase
   * @param {number} token
   */
  async function swapText(phrase, token) {
    if (motion.matches) {
      text.classList.remove(CLASS_TEXT_IN, CLASS_TEXT_OUT);
      text.textContent = phrase;
      return;
    }

    text.classList.remove(CLASS_TEXT_IN);
    text.classList.add(CLASS_TEXT_OUT);

    await wait(heroSettings.textOutMs);

    if (destroyed || token !== textToken) {
      return;
    }

    text.textContent = phrase;
    text.classList.remove(CLASS_TEXT_OUT);
    text.classList.add(CLASS_TEXT_IN);

    await wait(heroSettings.textInMs);

    if (destroyed || token !== textToken) {
      return;
    }

    text.classList.remove(CLASS_TEXT_IN);
  }


  /* ----- Background photographs ------------------------------------------- */

  /**
   * Downloads a slide's photograph, once, and resolves to whether it loaded.
   *
   * @param {number} index
   * @returns {Promise<boolean>}
   */
  function ensureLoaded(index) {
    const photo = photos[index];

    if (!photo) {
      return Promise.resolve(false);
    }

    const cached = loading.get(index);

    if (cached) {
      return cached;
    }

    const promise = new Promise((resolve) => {
      if (photo.getAttribute('src') && photo.complete) {
        resolve(photo.naturalWidth > 0);
        return;
      }

      photo.addEventListener(
        'load',
        () => {
          // Decode first, so the fade does not stutter on a big image
          Promise.resolve(photo.decode?.())
            .catch(() => {})
            .then(() => resolve(true));
        },
        { once: true },
      );

      photo.addEventListener('error', () => resolve(false), { once: true });

      if (!photo.getAttribute('src')) {
        photo.src = slides[index].image.src;
      }
    });

    loading.set(index, promise);

    return promise;
  }

  /** Fetches the next slide's photograph when the browser has nothing better to do. */
  function preloadNext() {
    const run = () => {
      if (!destroyed) {
        ensureLoaded((current + 1) % total);
      }
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      window.setTimeout(run, 400);
    }
  }

  /**
   * Fades a slide's photograph in on top of the old one, then hides the old
   * ones. Fading in over a fully visible photograph avoids the brief dip to
   * dark that a simultaneous cross-fade would cause.
   *
   * @param {number} index
   * @param {number} token
   */
  async function showPhoto(index, token) {
    const next = photos[index];

    if (!next) {
      return;
    }

    const loaded = await ensureLoaded(index);

    // A failed photograph is skipped: the old background stays
    if (destroyed || token !== backgroundToken || !loaded) {
      return;
    }

    layer += 1;
    next.style.zIndex = String(layer);
    next.classList.remove(CLASS_BG_HIDDEN);
    next.classList.add(CLASS_BG_VISIBLE);

    await wait(heroSettings.backgroundFadeMs);

    if (destroyed || token !== backgroundToken) {
      return;
    }

    photos.forEach((photo) => {
      if (photo && photo !== next) {
        photo.classList.remove(CLASS_BG_VISIBLE);
        photo.classList.add(CLASS_BG_HIDDEN);
      }
    });

    preloadNext();
  }


  /* ----- Changing slides -------------------------------------------------- */

  /**
   * Shows a slide. Everything that must change at once changes now (dots,
   * counter), and the animated parts (text, photograph) follow.
   *
   * @param {number} index
   */
  function goTo(index) {
    if (index === current || index < 0 || index >= total) {
      return;
    }

    current = index;
    pendingAdvance = false;

    // The newly selected dot restarts its progress bar through CSS
    dots.slice(0, total).forEach((dot, dotIndex) => {
      const selected = dotIndex === index;

      dot.setAttribute('aria-selected', String(selected));
      dot.tabIndex = selected ? 0 : -1;
    });

    if (counter) {
      counter.textContent = pad(index + 1);
    }

    textToken += 1;
    backgroundToken += 1;

    swapText(slides[index].phrase, textToken);
    showPhoto(index, backgroundToken);
  }

  function advance() {
    goTo((current + 1) % total);
  }

  /**
   * Starts the active dot's progress bar again from empty, so the first
   * interval is counted from now and not from when the page began loading.
   */
  function restartProgress() {
    const active = dots[current];

    active.setAttribute('aria-selected', 'false');

    // Reading offsetWidth makes the browser apply the change before the next one
    void active.offsetWidth;

    active.setAttribute('aria-selected', 'true');
  }


  /* ----- Events ----------------------------------------------------------- */

  /** @param {AnimationEvent} event */
  function onAnimationEnd(event) {
    // Only the active dot's progress bar is the clock
    if (
      event.pseudoElement !== '::after' ||
      event.animationName !== 'dot-progress' ||
      event.target !== dots[current]
    ) {
      return;
    }

    // With reduced motion the bar ends at once: never advance by itself
    if (reasons.has('reduced')) {
      return;
    }

    // Finished while paused (for example the tab went to the background just
    // then): remember it, and advance as soon as the pause ends
    if (reasons.size) {
      pendingAdvance = true;
      return;
    }

    advance();
  }

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-hero-dot]') : null;
    const position = target ? dots.indexOf(/** @type {HTMLElement} */ (target)) : -1;

    if (position < 0 || position >= total) {
      return;
    }

    let next = -1;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (position + 1) % total;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (position - 1 + total) % total;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = total - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    goTo(next);
    dots[next].focus();
  }

  /** @param {FocusEvent} event */
  function onFocusIn(event) {
    // Only keyboard focus pauses. A mouse click on a dot must not freeze the slider.
    if (event.target instanceof Element && event.target.matches(':focus-visible')) {
      setReason('focus', true);
    }
  }

  /** @param {FocusEvent} event */
  function onFocusOut(event) {
    const next = event.relatedTarget;

    if (!(next instanceof Node) || !controls.contains(next)) {
      setReason('focus', false);
    }
  }

  const cleanups = [
    on(dotsElement, 'animationend', onAnimationEnd),
    on(dotsElement, 'keydown', onKeydown),
    delegate(dotsElement, 'click', '[data-hero-dot]', (event, dot) => {
      goTo(dots.indexOf(/** @type {HTMLElement} */ (dot)));
    }),
    on(toggle, 'click', () => setReason('user', !reasons.has('user'))),
    on(controls, 'pointerenter', () => setReason('hover', true)),
    on(controls, 'pointerleave', () => setReason('hover', false)),
    on(controls, 'focusin', onFocusIn),
    on(controls, 'focusout', onFocusOut),
    on(document, 'visibilitychange', () => setReason('hidden', document.hidden)),
    on(motion, 'change', () => setReason('reduced', motion.matches)),
    observeVisibility(hero, (visible) => setReason('offscreen', !visible), {
      threshold: SLIDER_VISIBLE_THRESHOLD,
    }),
  ];

  // Initial state
  setReason('hidden', document.hidden);
  setReason('reduced', motion.matches);
  updateToggle();
  restartProgress();

  if (document.readyState === 'complete') {
    preloadNext();
  } else {
    cleanups.push(on(window, 'load', preloadNext, { once: true }));
  }

  return function destroy() {
    destroyed = true;
    cleanups.forEach((cleanup) => cleanup());
    toggle.remove();
    createdPhotos.forEach((photo) => photo.remove());
  };
}


/* ==========================================================================
   Public entry point
   ========================================================================== */

/**
 * Starts the hero: parallax layers and the headline slider.
 *
 * @returns {(() => void) | undefined} Teardown function, or undefined when the
 *   page has no hero.
 */
export function initHero() {
  const hero = document.querySelector('[data-hero]');

  if (!(hero instanceof HTMLElement)) {
    return undefined;
  }

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cleanups = [initParallax(hero, motion), initSlider(hero, motion)];

  return function destroy() {
    cleanups.forEach((cleanup) => cleanup());
  };
}