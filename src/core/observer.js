/**
 * Aura Design: core/observer.js
 *
 * IntersectionObserver wrappers for two page-wide behaviours:
 *
 *  1. Scroll reveal. Elements marked with data-reveal fade up the first time
 *     they scroll into view. The hidden starting state is in main.css and
 *     only applies under html.js, so content stays visible without
 *     JavaScript. This module adds the "is-visible" class that ends it.
 *
 *  2. Lazy images. Images marked with data-lazy fade in once they have
 *     loaded. Two forms are supported:
 *       <img data-lazy src="..." loading="lazy" ...>
 *           The browser decides when to download. This module only adds
 *           "is-loaded" when the file has arrived, so an image that loads
 *           off-screen does not pop in later.
 *       <img data-lazy data-src="..." data-srcset="..." data-sizes="..." ...>
 *           No download happens until the image is within 300px of the
 *           viewport, then src, srcset and sizes are filled in from the data
 *           attributes.
 *     A failed image still gets "is-loaded", so its alt text is not hidden.
 *
 * Content added to the page after startup (portfolio cards, service cards)
 * is picked up automatically by a MutationObserver, so components never need
 * to register their elements.
 *
 * Optional stagger: elements that become visible in the same moment (a row of
 * columns, the hero's lines of text) are delayed by 90 ms each, up to
 * 450 ms, by setting --reveal-delay on them. An element that already has its
 * own inline --reveal-delay keeps it.
 *
 * Exports
 *   initReveal           starts both behaviours (called from main.js)
 *   observeVisibility    general-purpose "is this element on screen" helper,
 *                        for example to pause the hero slider off-screen
 */

import { prefersReducedMotion } from './dom.js';

const REVEAL_SELECTOR = '[data-reveal]';
const LAZY_SELECTOR = 'img[data-lazy]';

/** Reveal when an element is 10% of the viewport height inside its bottom edge. */
const REVEAL_ROOT_MARGIN = '0px 0px -10% 0px';

/** Start downloading data-src images this far before they scroll into view. */
const LAZY_ROOT_MARGIN = '300px 0px';

const STAGGER_STEP_MS = 90;
const STAGGER_MAX_MS = 450;

/** How long after a reveal the temporary --reveal-delay stays before removal. */
const DELAY_CLEANUP_MS = 1400;

const hasIntersectionObserver = 'IntersectionObserver' in window;


/* ==========================================================================
   General-purpose helper
   ========================================================================== */

/**
 * Reports whenever an element enters or leaves the viewport.
 *
 * @param {Element} target
 * @param {(isVisible: boolean, entry: IntersectionObserverEntry | null) => void} callback
 *   Called on every change. Without IntersectionObserver support it is
 *   called once with true, so callers can treat the element as always visible.
 * @param {{ threshold?: number | number[], rootMargin?: string }} [options]
 * @returns {() => void} Call to stop observing.
 */
export function observeVisibility(target, callback, options = {}) {
  if (!hasIntersectionObserver) {
    callback(true, null);
    return () => {};
  }

  const { threshold = 0, rootMargin = '0px' } = options;

  const observer = new IntersectionObserver(
    (entries) => {
      // Several entries for one target can arrive together; the last is current
      const latest = entries[entries.length - 1];
      callback(latest.isIntersecting, latest);
    },
    { threshold, rootMargin },
  );

  observer.observe(target);

  return () => observer.disconnect();
}


/* ==========================================================================
   Helpers
   ========================================================================== */

/**
 * Elements matching a selector inside a node, including the node itself.
 *
 * @param {Element | Document} root
 * @param {string} selector
 * @returns {Element[]}
 */
function collect(root, selector) {
  const found = [];

  if (root instanceof Element && root.matches(selector)) {
    found.push(root);
  }

  found.push(...root.querySelectorAll(selector));

  return found;
}

/** Sort comparator: document order. */
function byDocumentOrder(a, b) {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * Adds "is-loaded" to an image once it has loaded, or has failed.
 *
 * @param {HTMLImageElement} image
 */
function markLoadedWhenReady(image) {
  const finish = () => image.classList.add('is-loaded');

  // No source at all: nothing will ever load, so do not leave it invisible
  if (!image.getAttribute('src')) {
    finish();
    return;
  }

  if (image.complete) {
    finish();
    return;
  }

  image.addEventListener('load', finish, { once: true });
  image.addEventListener('error', finish, { once: true });
}

/**
 * Fills in the real image source from data-src, data-srcset and data-sizes,
 * then waits for it to load.
 *
 * @param {HTMLImageElement} image
 */
function loadDeferredImage(image) {
  const { src, srcset, sizes } = image.dataset;

  // srcset and sizes must be set before src so the right file is chosen
  if (srcset) {
    image.srcset = srcset;
  }

  if (sizes) {
    image.sizes = sizes;
  }

  if (src) {
    image.src = src;
  }

  image.removeAttribute('data-src');
  image.removeAttribute('data-srcset');
  image.removeAttribute('data-sizes');

  markLoadedWhenReady(image);
}


/* ==========================================================================
   Public entry point
   ========================================================================== */

/**
 * Starts scroll reveal and lazy image fade-in for the whole page.
 *
 * @returns {() => void} Teardown function, handy for hot reload in development.
 */
export function initReveal() {
  const registered = new WeakSet();
  const cleanupTimers = new Set();

  /** @type {IntersectionObserver | null} */
  let revealObserver = null;

  /** @type {IntersectionObserver | null} */
  let lazyObserver = null;

  /**
   * Shows a batch of elements that became visible together, staggering them.
   *
   * @param {IntersectionObserverEntry[]} entries
   */
  function revealBatch(entries) {
    const targets = entries
      .filter((entry) => entry.isIntersecting)
      .map((entry) => entry.target)
      .sort(byDocumentOrder);

    const stagger = !prefersReducedMotion();

    targets.forEach((element, index) => {
      revealObserver?.unobserve(element);

      if (stagger && index > 0 && element instanceof HTMLElement) {
        const hasOwnDelay = element.style.getPropertyValue('--reveal-delay') !== '';

        if (!hasOwnDelay) {
          const delay = Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS);
          element.style.setProperty('--reveal-delay', `${delay}ms`);

          // Remove the delay afterwards so later hover transitions are not slowed
          const timer = window.setTimeout(() => {
            element.style.removeProperty('--reveal-delay');
            cleanupTimers.delete(timer);
          }, delay + DELAY_CLEANUP_MS);

          cleanupTimers.add(timer);
        }
      }

      element.classList.add('is-visible');
    });
  }

  /**
   * Starts loading data-src images that came near the viewport.
   *
   * @param {IntersectionObserverEntry[]} entries
   */
  function loadBatch(entries) {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      lazyObserver?.unobserve(entry.target);
      loadDeferredImage(/** @type {HTMLImageElement} */ (entry.target));
    });
  }

  if (hasIntersectionObserver) {
    revealObserver = new IntersectionObserver(revealBatch, {
      threshold: 0,
      rootMargin: REVEAL_ROOT_MARGIN,
    });

    lazyObserver = new IntersectionObserver(loadBatch, {
      threshold: 0,
      rootMargin: LAZY_ROOT_MARGIN,
    });
  }

  /**
   * Registers every reveal element and lazy image inside a node. Safe to call
   * repeatedly: elements already seen are skipped.
   *
   * @param {Element | Document} root
   */
  function register(root) {
    collect(root, REVEAL_SELECTOR).forEach((element) => {
      if (registered.has(element)) {
        return;
      }

      registered.add(element);

      // Show at once when motion is reduced or observing is impossible
      if (!revealObserver || prefersReducedMotion()) {
        element.classList.add('is-visible');
        return;
      }

      if (!element.classList.contains('is-visible')) {
        revealObserver.observe(element);
      }
    });

    collect(root, LAZY_SELECTOR).forEach((element) => {
      if (registered.has(element) || !(element instanceof HTMLImageElement)) {
        return;
      }

      registered.add(element);

      const isDeferred = element.dataset.src !== undefined || element.dataset.srcset !== undefined;

      if (!isDeferred) {
        markLoadedWhenReady(element);
      } else if (lazyObserver) {
        lazyObserver.observe(element);
      } else {
        loadDeferredImage(element);
      }
    });
  }

  // Elements already in the page
  register(document);

  // Elements that components add later, such as gallery and service cards
  const mutationObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          register(node);
        }
      });
    });
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });

  return function destroy() {
    revealObserver?.disconnect();
    lazyObserver?.disconnect();
    mutationObserver.disconnect();

    cleanupTimers.forEach((timer) => window.clearTimeout(timer));
    cleanupTimers.clear();
  };
}