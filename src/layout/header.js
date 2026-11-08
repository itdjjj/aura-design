/**
 * Aura Design: layout/header.js
 *
 * Scroll-aware behaviour for the fixed site header:
 *
 *  1. Sets data-scrolled="true" on [data-header] once the page has scrolled,
 *     which switches the header from transparent (over the hero) to a solid
 *     blurred bar. The styles live in the Tailwind classes in index.html
 *     (data-[scrolled=true]: and group-data-[scrolled=true]: variants).
 *
 *  2. Highlights the navigation link of the section currently in view by
 *     setting aria-current="true" on it. components.css underlines desktop
 *     links and tints mobile links when that attribute is present.
 *
 *  3. Publishes the live header height as the CSS custom property
 *     --header-height on <html>, so core/scroll.js can offset anchor jumps.
 *
 * Only links inside a <nav> are highlighted, so the logo and the hero's
 * scroll cue (which also carry data-nav-link) never get aria-current.
 */

/** Pixels scrolled before the header switches to its solid style. */
const SCROLLED_THRESHOLD = 24;

/** The section whose top has passed this fraction of the viewport is "current". */
const ACTIVE_LINE_RATIO = 0.4;

/** Distance from the page bottom that counts as "at the bottom". */
const BOTTOM_TOLERANCE = 4;

/** After a nav click, ignore scroll-spy this long if scrollend never arrives. */
const CLICK_LOCK_FALLBACK_MS = 1200;

/**
 * Finds the in-page sections the navigation points to, in document order.
 *
 * @param {HTMLAnchorElement[]} links
 * @returns {HTMLElement[]}
 */
function collectSections(links) {
  const ids = new Set();

  links.forEach((link) => {
    const id = link.hash.slice(1);

    if (id) {
      ids.add(id);
    }
  });

  return Array.from(ids)
    .map((id) => document.getElementById(id))
    .filter((element) => element instanceof HTMLElement)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/**
 * Starts the header behaviour.
 *
 * @returns {(() => void) | undefined} Teardown function, or undefined when the
 *   page has no header. Handy for hot module replacement during development.
 */
export function initHeader() {
  const header = document.querySelector('[data-header]');

  if (!header) {
    return undefined;
  }

  const root = document.documentElement;
  const navLinks = Array.from(document.querySelectorAll('nav a[data-nav-link][href^="#"]'));
  const sections = collectSections(navLinks);

  let frameId = 0;
  let isScrolled = null;
  let activeId = null;
  let isLocked = false;
  let lockTimer = 0;
  let releaseLock = null;

  /** Keeps --header-height in sync with the real rendered height. */
  function syncHeaderHeight() {
    root.style.setProperty('--header-height', `${header.offsetHeight}px`);
  }

  /** Toggles the solid header style. */
  function updateScrolledState() {
    const next = window.scrollY > SCROLLED_THRESHOLD;

    if (next === isScrolled) {
      return;
    }

    isScrolled = next;
    header.dataset.scrolled = String(next);
  }

  /**
   * Works out which section is in view.
   *
   * @returns {string | null}
   */
  function findActiveId() {
    if (!sections.length) {
      return null;
    }

    const viewportHeight = window.innerHeight;
    const atBottom =
      window.scrollY + viewportHeight >= root.scrollHeight - BOTTOM_TOLERANCE;

    // Short final sections (like the contact form) may never reach the line
    if (atBottom) {
      return sections[sections.length - 1].id;
    }

    const line = viewportHeight * ACTIVE_LINE_RATIO;
    let current = sections[0].id;

    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) {
        current = section.id;
      }
    }

    return current;
  }

  /**
   * Marks the links for the given section as current and clears the others.
   *
   * @param {string | null} id
   */
  function setActive(id) {
    if (id === activeId) {
      return;
    }

    activeId = id;

    navLinks.forEach((link) => {
      if (id && link.hash === `#${id}`) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  /** One scroll or resize tick, run at most once per animation frame. */
  function update() {
    frameId = 0;
    updateScrolledState();

    if (!isLocked) {
      setActive(findActiveId());
    }
  }

  function scheduleUpdate() {
    if (!frameId) {
      frameId = window.requestAnimationFrame(update);
    }
  }

  /**
   * After a navigation click, highlight the target at once and pause
   * scroll-spy until the smooth scroll settles, so the highlight does not
   * flicker through every section on the way.
   *
   * @param {string} id
   */
  function lockActive(id) {
    window.clearTimeout(lockTimer);

    if (releaseLock) {
      window.removeEventListener('scrollend', releaseLock);
    }

    isLocked = true;
    setActive(id);

    releaseLock = () => {
      isLocked = false;
      window.clearTimeout(lockTimer);
      window.removeEventListener('scrollend', releaseLock);
      releaseLock = null;
      scheduleUpdate();
    };

    // scrollend is not available everywhere, hence the timer fallback
    window.addEventListener('scrollend', releaseLock, { once: true });
    lockTimer = window.setTimeout(releaseLock, CLICK_LOCK_FALLBACK_MS);
  }

  /** @param {MouseEvent} event */
  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('nav a[data-nav-link][href^="#"]');

    if (!link || !navLinks.includes(link)) {
      return;
    }

    const id = link.hash.slice(1);

    if (id && document.getElementById(id)) {
      lockActive(id);
    }
  }

  /** Restores state when the page returns from the back/forward cache. */
  function onPageShow() {
    syncHeaderHeight();
    scheduleUpdate();
  }

  const resizeObserver =
    'ResizeObserver' in window
      ? new ResizeObserver(() => {
          syncHeaderHeight();
          scheduleUpdate();
        })
      : null;

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('click', onClick);
  resizeObserver?.observe(header);

  // Initial state: the page may already be scrolled (reload, back button, #hash)
  syncHeaderHeight();
  update();

  return function destroy() {
    window.cancelAnimationFrame(frameId);
    window.clearTimeout(lockTimer);

    if (releaseLock) {
      window.removeEventListener('scrollend', releaseLock);
    }

    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('click', onClick);
    resizeObserver?.disconnect();
  };
}