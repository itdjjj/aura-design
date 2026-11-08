/**
 * Aura Design: core/scroll.js
 *
 * Page-wide scrolling behaviour:
 *
 *  1. Smooth in-page navigation. One delegated click listener on the document
 *     handles every link that points at a section of this page (header, mobile
 *     menu, hero buttons, footer, "Back to top", the skip link). Links added
 *     later work without any registration.
 *       - The target stops below the fixed header, using its live height.
 *       - The URL hash is updated with replaceState, so a section can be
 *         shared without filling the back-button history.
 *       - Focus moves to the target section (with no visible ring on the
 *         section itself), so keyboard and screen-reader users land where the
 *         page scrolled, and the skip link actually moves focus.
 *       - Visitors who prefer reduced motion get an instant jump.
 *     Scrolling uses the browser's native smooth behaviour. That keeps the
 *     "scrollend" event working, which layout/header.js uses to know when to
 *     resume highlighting the current section.
 *
 *  2. Initial hash alignment. After a fresh load of a URL such as /#services,
 *     the position is corrected once the page has finished loading (fonts and
 *     images can shift the layout after the browser's own jump). It is skipped
 *     on reload and back/forward navigation, and when the visitor has already
 *     scrolled, so it never fights the visitor.
 *
 *  3. A shared scroll loop (onScrollFrame). Any number of components, such as
 *     the hero parallax, subscribe to one passive scroll listener that runs
 *     at most once per animation frame, instead of each adding its own.
 *
 * Without JavaScript the browser's own anchor jump still works: main.css gives
 * every section[id] a scroll-margin-top equal to the header height, and turns
 * on CSS smooth scrolling only when the "js" class is absent.
 *
 * Exports
 *   initScroll        starts 1 and 2 (called from main.js)
 *   scrollToTarget    scrolls to an element or id from code
 *   onScrollFrame     subscribes to the shared scroll loop
 *   getHeaderOffset   current height of the fixed header in pixels
 */

import { prefersReducedMotion } from './dom.js';

/** Events that count as the visitor taking control of scrolling. */
const INTERACTION_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'];


/* ==========================================================================
   Helpers
   ========================================================================== */

/**
 * Current height of the fixed header, so targets can stop just below it.
 * Reads the element directly (layout/header.js keeps --header-height in sync
 * with the same value, but the element is always correct).
 *
 * @returns {number} Pixels, or 0 when the page has no header.
 */
export function getHeaderOffset() {
  const header = document.querySelector('[data-header]');

  return header ? header.getBoundingClientRect().height : 0;
}

/**
 * Finds the element a URL hash points at.
 *
 * @param {string} hash  For example "#services".
 * @returns {HTMLElement | null}
 */
function getTargetFromHash(hash) {
  if (!hash || hash === '#') {
    return null;
  }

  let id = hash.slice(1);

  try {
    id = decodeURIComponent(id);
  } catch {
    // A malformed escape sequence: use the id as written
  }

  const element = document.getElementById(id);

  return element instanceof HTMLElement ? element : null;
}

/**
 * Updates the address bar without adding a history entry. Wrapped because
 * some embedded or sandboxed contexts forbid history changes.
 *
 * @param {string} hash  A hash such as "#contact", or "" to clear it.
 */
function setHash(hash) {
  try {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(null, '', url);
  } catch {
    // Not critical: the page still scrolled
  }
}

/**
 * Moves keyboard focus to a section after scrolling. Sections are not
 * focusable by default, so tabindex="-1" is added for the moment and removed
 * again on blur. The outline is hidden on the section itself, because a ring
 * around a whole section is noise, not help.
 *
 * @param {HTMLElement} element
 */
function focusTarget(element) {
  const addedTabindex = !element.hasAttribute('tabindex');
  const previousOutline = element.style.outline;

  if (addedTabindex) {
    element.setAttribute('tabindex', '-1');
  }

  element.style.outline = 'none';

  // preventScroll: the smooth scroll is already under way
  element.focus({ preventScroll: true });

  element.addEventListener(
    'blur',
    () => {
      element.style.outline = previousOutline;

      if (addedTabindex) {
        element.removeAttribute('tabindex');
      }
    },
    { once: true },
  );
}


/* ==========================================================================
   Scrolling to a target
   ========================================================================== */

/**
 * @typedef {Object} ScrollOptions
 * @property {ScrollBehavior} [behavior]  Defaults to "smooth", or "auto"
 *   (instant) when the visitor prefers reduced motion.
 * @property {boolean} [focus=true]       Move focus to the target.
 * @property {boolean} [updateHash=false] Put the target's id in the URL.
 */

/**
 * Scrolls so that an element sits just below the fixed header.
 *
 * @param {HTMLElement | string} target  An element, or an id (with or without "#").
 * @param {ScrollOptions} [options]
 * @returns {boolean} False when the target does not exist.
 */
export function scrollToTarget(target, options = {}) {
  const element =
    typeof target === 'string'
      ? getTargetFromHash(target.startsWith('#') ? target : `#${target}`)
      : target;

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const {
    behavior = prefersReducedMotion() ? 'auto' : 'smooth',
    focus = true,
    updateHash = false,
  } = options;

  // The hero starts at the very top, so the subtraction can go negative
  const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - getHeaderOffset());

  window.scrollTo({ top, behavior });

  if (updateHash && element.id) {
    setHash(`#${element.id}`);
  }

  if (focus) {
    focusTarget(element);
  }

  return true;
}


/* ==========================================================================
   Shared scroll loop
   ========================================================================== */

/**
 * @typedef {Object} ScrollState
 * @property {number} scrollY         Pixels scrolled from the top.
 * @property {number} viewportHeight  Height of the visible window.
 * @property {number} viewportWidth   Width of the visible window.
 */

/** @type {Set<(state: ScrollState) => void>} */
const subscribers = new Set();

let isListening = false;
let frameRequested = false;

/** @returns {ScrollState} */
function readScrollState() {
  return {
    scrollY: window.scrollY,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  };
}

/** Runs every subscriber once, with a single shared read of the scroll state. */
function flushSubscribers() {
  frameRequested = false;

  const state = readScrollState();

  subscribers.forEach((callback) => {
    try {
      callback(state);
    } catch (error) {
      // One failing subscriber must not stop the others
      console.error('[Aura Design] A scroll subscriber threw an error.', error);
    }
  });
}

function requestFlush() {
  if (!frameRequested) {
    frameRequested = true;
    window.requestAnimationFrame(flushSubscribers);
  }
}

/**
 * Subscribes to scroll and resize, throttled to one call per animation frame
 * and shared between all subscribers. The listeners exist only while at least
 * one subscriber is registered.
 *
 * @param {(state: ScrollState) => void} callback
 * @param {{ immediate?: boolean }} [options]
 *   immediate (default true): also call once right away with the current state.
 * @returns {() => void} Call to unsubscribe.
 */
export function onScrollFrame(callback, { immediate = true } = {}) {
  subscribers.add(callback);

  if (!isListening) {
    window.addEventListener('scroll', requestFlush, { passive: true });
    window.addEventListener('resize', requestFlush, { passive: true });
    isListening = true;
  }

  if (immediate) {
    callback(readScrollState());
  }

  return function unsubscribe() {
    subscribers.delete(callback);

    if (!subscribers.size && isListening) {
      window.removeEventListener('scroll', requestFlush);
      window.removeEventListener('resize', requestFlush);
      isListening = false;
    }
  };
}


/* ==========================================================================
   Public entry point
   ========================================================================== */

/**
 * Starts smooth in-page navigation and initial hash alignment.
 *
 * @returns {() => void} Teardown function, handy for hot reload in development.
 */
export function initScroll() {
  /** @param {MouseEvent} event */
  function onClick(event) {
    // Leave modified clicks alone: "open in new tab" and similar
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const origin = event.target instanceof Element ? event.target : null;
    const link = origin ? origin.closest('a[href]') : null;

    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    if ((link.target && link.target !== '_self') || link.hasAttribute('download')) {
      return;
    }

    const href = link.getAttribute('href') ?? '';

    if (!href.includes('#')) {
      return;
    }

    // Only links to this same page (so "/#contact" counts, other pages do not)
    const withoutHash = (url) => url.split('#')[0];

    if (withoutHash(link.href) !== withoutHash(window.location.href)) {
      return;
    }

    // A bare "#" means "back to the top"
    if (!link.hash) {
      event.preventDefault();

      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      setHash('');

      return;
    }

    const target = getTargetFromHash(link.hash);

    // Unknown id: let the browser do whatever it normally does
    if (!target) {
      return;
    }

    event.preventDefault();
    scrollToTarget(target, { updateHash: true, focus: true });
  }

  // Initial hash alignment ---------------------------------------------------

  let visitorInteracted = false;

  function markInteracted() {
    visitorInteracted = true;
  }

  INTERACTION_EVENTS.forEach((type) => {
    window.addEventListener(type, markInteracted, { once: true, passive: true });
  });

  /** True for a reload or back/forward visit, where the browser restores scroll. */
  function isRestoredVisit() {
    const [navigation] = performance.getEntriesByType('navigation');

    return Boolean(navigation && ['reload', 'back_forward'].includes(navigation.type));
  }

  function alignInitialHash() {
    if (visitorInteracted || isRestoredVisit()) {
      return;
    }

    const target = getTargetFromHash(window.location.hash);

    if (target) {
      scrollToTarget(target, { behavior: 'auto', focus: false });
    }
  }

  if (document.readyState === 'complete') {
    alignInitialHash();
  } else {
    window.addEventListener('load', alignInitialHash, { once: true });
  }

  document.addEventListener('click', onClick);

  return function destroy() {
    document.removeEventListener('click', onClick);
    window.removeEventListener('load', alignInitialHash);

    INTERACTION_EVENTS.forEach((type) => {
      window.removeEventListener(type, markInteracted);
    });
  };
}