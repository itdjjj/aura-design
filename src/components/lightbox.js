/**
 * Aura Design: components/lightbox.js
 *
 * The full-screen project viewer. It stays closed until another component
 * asks for it, which keeps the gallery and the viewer independent:
 *
 *   portfolio-gallery.js  emits  EVENTS.LIGHTBOX_OPEN  { projects, index }
 *   lightbox.js           emits  EVENTS.LIGHTBOX_CLOSE { index }
 *
 * "projects" is the list the gallery is showing right now (after filtering),
 * and "index" is the position of the one that was clicked, so the arrows only
 * step through what the visitor was looking at. The project shape is
 * documented in data/portfolio.js.
 *
 * Markup it controls (all in index.html, at the end of <body>)
 *   [data-lightbox]            the dialog. Opened and closed with data-open="true|false",
 *                              which the Tailwind classes turn into a fade.
 *   [data-lightbox-image]      the large photograph
 *   [data-lightbox-title]      project name
 *   [data-lightbox-meta]       "Category · Location · Year"
 *   [data-lightbox-counter]    "3 / 12"
 *   [data-lightbox-prev] [data-lightbox-next] [data-lightbox-close]   the buttons
 *
 * Behaviour
 *   - Next and previous wrap around. With a single project the arrows are hidden.
 *   - The photograph fades out, the next one is loaded in the background, and
 *     it fades in once ready, so there is never a half-loaded picture. The
 *     neighbouring photographs are fetched ahead of time.
 *   - Keyboard: Escape closes, Left and Right arrows navigate, Home and End
 *     jump to the first and last, Tab stays inside the viewer.
 *   - Touch: swipe left or right to navigate.
 *   - Clicking the dark area around the photograph closes it.
 *   - The page behind cannot scroll, and is made inert so neither keyboards
 *     nor screen readers can reach it. Focus moves into the viewer, and goes
 *     back to the card that opened it when the viewer closes.
 *   - Changing project announces the title and details politely to screen
 *     readers.
 *
 * The close is instant rather than faded, because the markup only transitions
 * opacity and the viewer becomes invisible at once. That keeps the page
 * responsive when a visitor closes it and clicks on.
 */

import {
  getFocusable,
  lockScroll,
  on,
  prefersReducedMotion,
  sanitizeUrl,
  setVisible,
  unlockScroll,
  wait,
} from '../core/dom.js';
import { EVENTS, events } from '../core/store.js';
import { getCategoryLabel } from '../data/portfolio.js';


/* ==========================================================================
   Constants
   ========================================================================== */

/** Class from components.css that fades the photograph out. */
const CLASS_CHANGING = 'is-changing';

/** Matches the 0.3s opacity transition on [data-lightbox-image] in components.css. */
const FADE_MS = 300;

/** Horizontal distance (px) that counts as a swipe. */
const SWIPE_DISTANCE = 50;

/** A swipe must stay mostly horizontal: more vertical travel than this is a scroll. */
const SWIPE_MAX_VERTICAL = 70;

/** Page regions that must be unreachable while the viewer is open. */
const BACKGROUND_SELECTOR = '[data-header], main, footer';


/* ==========================================================================
   Helpers
   ========================================================================== */

/**
 * True for an object that has what the viewer needs to show a project.
 *
 * @param {any} project
 * @returns {boolean}
 */
function isProject(project) {
  return Boolean(
    project &&
      typeof project.title === 'string' &&
      project.image &&
      typeof project.image.src === 'string',
  );
}

/**
 * "Residential · Hudson Valley, New York · 2025". The dot separates the three
 * parts, because the location itself contains a comma.
 *
 * @param {any} project
 * @returns {string}
 */
function formatMeta(project) {
  return [getCategoryLabel(project.category), project.location, project.year]
    .filter(Boolean)
    .join(' · ');
}


/* ==========================================================================
   Public entry point
   ========================================================================== */

/**
 * Starts the viewer and listens for LIGHTBOX_OPEN.
 *
 * @returns {(() => void) | undefined} Teardown function, or undefined when the
 *   page has no viewer markup.
 */
export function initLightbox() {
  const lightbox = document.querySelector('[data-lightbox]');
  const image = document.querySelector('[data-lightbox-image]');
  const closeButton = document.querySelector('[data-lightbox-close]');

  if (
    !(lightbox instanceof HTMLElement) ||
    !(image instanceof HTMLImageElement) ||
    !(closeButton instanceof HTMLElement)
  ) {
    console.warn('[Aura Design] The lightbox is missing required markup and was not started.');
    return undefined;
  }

  const prevButton = lightbox.querySelector('[data-lightbox-prev]');
  const nextButton = lightbox.querySelector('[data-lightbox-next]');
  const title = lightbox.querySelector('[data-lightbox-title]');
  const meta = lightbox.querySelector('[data-lightbox-meta]');
  const counter = lightbox.querySelector('[data-lightbox-counter]');

  /** The captions are announced politely when they change. */
  title?.parentElement?.setAttribute('aria-live', 'polite');

  /** @type {any[]} */
  let projects = [];
  let current = 0;
  let isOpen = false;
  let destroyed = false;
  let showToken = 0;

  /** The element that had focus before opening, so focus can go back to it. */
  let opener = null;

  let touchStartX = 0;
  let touchStartY = 0;

  /** @type {Map<string, Promise<boolean>>} */
  const preloaded = new Map();

  image.decoding = 'async';


  /* ----- Images ----------------------------------------------------------- */

  /**
   * Downloads and decodes a photograph in the background, once.
   *
   * @param {string} source
   * @returns {Promise<boolean>} Whether it loaded.
   */
  function preload(source) {
    const cached = preloaded.get(source);

    if (cached) {
      return cached;
    }

    const promise = new Promise((resolve) => {
      const probe = new Image();

      probe.onload = () => {
        // Decode first, so the fade-in does not stutter on a large file
        Promise.resolve(probe.decode?.())
          .catch(() => {})
          .then(() => resolve(true));
      };

      probe.onerror = () => resolve(false);
      probe.src = source;
    });

    preloaded.set(source, promise);

    return promise;
  }

  /** Fetches the photographs on either side of the current one. */
  function preloadNeighbours() {
    if (projects.length < 2) {
      return;
    }

    [1, -1].forEach((step) => {
      const neighbour = projects[(current + step + projects.length) % projects.length];

      preload(sanitizeUrl(neighbour.image.src));
    });
  }


  /* ----- Showing a project ------------------------------------------------ */

  /**
   * Shows one project. The text and the photograph change together, once the
   * new photograph is ready.
   *
   * @param {number} index
   * @param {{ animate: boolean }} options  animate: fade the old photograph out first.
   */
  async function show(index, { animate }) {
    current = index;

    const project = projects[index];
    const source = sanitizeUrl(project.image.src);
    const token = (showToken += 1);

    if (animate && !prefersReducedMotion()) {
      image.classList.add(CLASS_CHANGING);
      await Promise.all([preload(source), wait(FADE_MS)]);
    } else {
      await preload(source);
    }

    // Closed, or a newer request arrived while this one was loading
    if (destroyed || !isOpen || token !== showToken) {
      return;
    }

    image.alt = project.image.alt ?? '';

    if (project.image.width && project.image.height) {
      image.width = project.image.width;
      image.height = project.image.height;
    }

    image.src = source;

    if (title) {
      title.textContent = project.title;
    }

    if (meta) {
      meta.textContent = formatMeta(project);
    }

    if (counter) {
      counter.textContent = `${index + 1} / ${projects.length}`;
    }

    image.classList.remove(CLASS_CHANGING);
    preloadNeighbours();
  }

  /**
   * Moves to the next or previous project, wrapping around at the ends.
   *
   * @param {number} step  1 for next, -1 for previous.
   */
  function navigate(step) {
    if (!isOpen || projects.length < 2) {
      return;
    }

    show((current + step + projects.length) % projects.length, { animate: true });
  }

  /**
   * Jumps to a specific project.
   *
   * @param {number} index
   */
  function jumpTo(index) {
    if (!isOpen || projects.length < 2 || index === current) {
      return;
    }

    show(index, { animate: true });
  }


  /* ----- Opening and closing ---------------------------------------------- */

  /** @param {boolean} inert */
  function setBackgroundInert(inert) {
    document.querySelectorAll(BACKGROUND_SELECTOR).forEach((region) => {
      region.toggleAttribute('inert', inert);
    });
  }

  /**
   * Opens the viewer on a list of projects.
   *
   * @param {any[]} list
   * @param {number} startIndex
   */
  function open(list, startIndex) {
    const items = Array.isArray(list) ? list.filter(isProject) : [];

    if (!items.length) {
      return;
    }

    projects = items;

    const index = Math.min(
      Math.max(Number.isInteger(startIndex) ? startIndex : 0, 0),
      items.length - 1,
    );

    setVisible(prevButton instanceof HTMLElement ? prevButton : null, items.length > 1);
    setVisible(nextButton instanceof HTMLElement ? nextButton : null, items.length > 1);

    // Already open (a new list arrived): just show the requested project
    if (isOpen) {
      show(index, { animate: true });
      return;
    }

    isOpen = true;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    lockScroll();
    setBackgroundInert(true);

    // Start with the photograph hidden, so the first one fades in once loaded
    image.classList.add(CLASS_CHANGING);
    image.removeAttribute('src');
    image.alt = '';

    lightbox.dataset.open = 'true';
    lightbox.setAttribute('aria-hidden', 'false');

    // One frame later the viewer is rendered and can take focus
    window.requestAnimationFrame(() => {
      if (isOpen) {
        closeButton.focus({ preventScroll: true });
      }
    });

    show(index, { animate: false });
  }

  /** Closes the viewer and gives focus back to what opened it. */
  function close() {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    showToken += 1;

    const index = current;

    lightbox.dataset.open = 'false';
    lightbox.setAttribute('aria-hidden', 'true');

    unlockScroll();
    setBackgroundInert(false);

    // The page must be reachable again before focus can return to it
    if (opener && opener.isConnected) {
      opener.focus({ preventScroll: true });
    }

    opener = null;

    events.emit(EVENTS.LIGHTBOX_CLOSE, { index });
  }


  /* ----- Events ----------------------------------------------------------- */

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (!isOpen) {
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        return;

      case 'ArrowRight':
        event.preventDefault();
        navigate(1);
        return;

      case 'ArrowLeft':
        event.preventDefault();
        navigate(-1);
        return;

      case 'Home':
        event.preventDefault();
        jumpTo(0);
        return;

      case 'End':
        event.preventDefault();
        jumpTo(projects.length - 1);
        return;

      case 'Tab': {
        // Keep focus inside the viewer
        const focusable = getFocusable(lightbox);

        if (!focusable.length) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !lightbox.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !lightbox.contains(active))) {
          event.preventDefault();
          first.focus();
        }

        return;
      }

      default:
    }
  }

  /** @param {MouseEvent} event */
  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;

    // The dark area around the photograph closes it. The photograph, its
    // caption and the buttons do not.
    if (target && !target.closest('figure, button')) {
      close();
    }
  }

  /** @param {TouchEvent} event */
  function onTouchStart(event) {
    const touch = event.changedTouches[0];

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }

  /** @param {TouchEvent} event */
  function onTouchEnd(event) {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = Math.abs(touch.clientY - touchStartY);

    if (Math.abs(deltaX) > SWIPE_DISTANCE && deltaY < SWIPE_MAX_VERTICAL) {
      // Swiping left reveals the next project, as in a photo gallery
      navigate(deltaX < 0 ? 1 : -1);
    }
  }

  const cleanups = [
    events.on(EVENTS.LIGHTBOX_OPEN, (payload) => {
      open(payload?.projects, payload?.index);
    }),
    on(closeButton, 'click', close),
    on(lightbox, 'click', onClick),
    on(lightbox, 'touchstart', onTouchStart, { passive: true }),
    on(lightbox, 'touchend', onTouchEnd, { passive: true }),
    on(document, 'keydown', onKeydown),
  ];

  if (prevButton) {
    cleanups.push(on(prevButton, 'click', () => navigate(-1)));
  }

  if (nextButton) {
    cleanups.push(on(nextButton, 'click', () => navigate(1)));
  }

  return function destroy() {
    destroyed = true;
    close();
    cleanups.forEach((cleanup) => cleanup());
  };
}