/**
 * Aura Design: layout/mobile-menu.js
 *
 * Slide-in navigation panel for screens below the Tailwind "lg" breakpoint.
 *
 * Markup it controls (all defined in index.html):
 *   [data-menu-toggle]   hamburger button in the header
 *   [data-mobile-menu]   the slide-in dialog panel
 *   [data-menu-overlay]  dimmed backdrop behind the panel
 *   [data-menu-close]    close button inside the panel
 *   [data-menu-link]     links and buttons that close the menu when used
 *
 * The open and closed look is driven entirely by data-open="true|false" on
 * the panel and overlay, through the data-[open=true]: variants in the
 * Tailwind classes, so this file only flips state and manages accessibility:
 *
 *   - aria-expanded and the label on the toggle button
 *   - focus moves into the panel on open, and returns to the toggle on close
 *   - Tab and Shift+Tab are trapped inside the panel while it is open
 *   - Escape, the close button, the backdrop and a swipe to the right close it
 *   - the page behind is made inert and cannot scroll (scroll-locked class,
 *     defined in main.css)
 *   - it closes by itself when the window grows to the desktop layout
 */

/** Matches Tailwind's "lg" breakpoint, where the desktop navigation appears. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** Horizontal swipe distance (px) that closes the panel. */
const SWIPE_CLOSE_DISTANCE = 70;

/** A swipe must stay mostly horizontal: vertical travel above this is a scroll. */
const SWIPE_MAX_VERTICAL = 60;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const LABEL_OPEN = 'Open navigation menu';
const LABEL_CLOSE = 'Close navigation menu';

/**
 * Starts the mobile menu.
 *
 * @returns {(() => void) | undefined} Teardown function, or undefined when the
 *   page has no mobile menu.
 */
export function initMobileMenu() {
  const toggle = document.querySelector('[data-menu-toggle]');
  const panel = document.querySelector('[data-mobile-menu]');
  const overlay = document.querySelector('[data-menu-overlay]');

  if (!toggle || !panel) {
    return undefined;
  }

  const closeButton = panel.querySelector('[data-menu-close]');
  const menuLinks = Array.from(document.querySelectorAll('[data-menu-link]'));
  const desktopQuery = window.matchMedia(DESKTOP_QUERY);

  // Page regions that must not be reachable while the dialog is open.
  // The panel and overlay are siblings of these, so they stay interactive.
  const backgroundRegions = Array.from(
    document.querySelectorAll('[data-header], main, footer'),
  );

  let isOpen = false;
  let focusFrame = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  // Closed panels must never be focusable, even before the first open
  panel.setAttribute('inert', '');
  panel.setAttribute('aria-hidden', 'true');

  /** @returns {HTMLElement[]} Visible focusable elements inside the panel. */
  function getFocusable() {
    return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (element) => element instanceof HTMLElement && element.offsetParent !== null,
    );
  }

  /** Locks or unlocks page scrolling (class defined in main.css). */
  function setScrollLock(locked) {
    document.documentElement.classList.toggle('scroll-locked', locked);
    document.body.classList.toggle('scroll-locked', locked);
  }

  /** Makes the page behind the dialog unreachable for keyboard and screen readers. */
  function setBackgroundInert(inert) {
    backgroundRegions.forEach((region) => {
      region.toggleAttribute('inert', inert);
    });
  }

  /**
   * Opens or closes the menu.
   *
   * @param {boolean} open
   * @param {{ restoreFocus?: boolean }} [options]
   *   restoreFocus: return focus to the toggle after closing (default true).
   *   Pass false when the close was caused by following a link or resizing.
   */
  function setOpen(open, { restoreFocus = true } = {}) {
    if (open === isOpen) {
      return;
    }

    isOpen = open;

    const state = String(open);
    panel.dataset.open = state;

    if (overlay) {
      overlay.dataset.open = state;
    }

    toggle.setAttribute('aria-expanded', state);
    toggle.setAttribute('aria-label', open ? LABEL_CLOSE : LABEL_OPEN);

    panel.toggleAttribute('inert', !open);
    panel.setAttribute('aria-hidden', String(!open));

    setScrollLock(open);
    setBackgroundInert(open);

    window.cancelAnimationFrame(focusFrame);

    if (open) {
      // Wait one frame so the panel is rendered before it receives focus
      focusFrame = window.requestAnimationFrame(() => {
        const first = closeButton instanceof HTMLElement ? closeButton : getFocusable()[0];
        first?.focus();
      });
    } else if (restoreFocus) {
      toggle.focus();
    }
  }

  function onToggleClick() {
    setOpen(!isOpen);
  }

  function onCloseClick() {
    setOpen(false);
  }

  /**
   * A navigation link was chosen. Unlock scrolling immediately (this handler
   * runs before the page-level smooth-scroll handler) so the jump to the
   * section is not blocked by the scroll lock.
   */
  function onLinkClick() {
    setOpen(false, { restoreFocus: false });
  }

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (!isOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = getFocusable();

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
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

    if (deltaX > SWIPE_CLOSE_DISTANCE && deltaY < SWIPE_MAX_VERTICAL) {
      setOpen(false);
    }
  }

  /** @param {MediaQueryListEvent} event */
  function onBreakpointChange(event) {
    if (event.matches) {
      setOpen(false, { restoreFocus: false });
    }
  }

  toggle.addEventListener('click', onToggleClick);
  closeButton?.addEventListener('click', onCloseClick);
  overlay?.addEventListener('click', onCloseClick);
  menuLinks.forEach((link) => link.addEventListener('click', onLinkClick));
  document.addEventListener('keydown', onKeydown);
  panel.addEventListener('touchstart', onTouchStart, { passive: true });
  panel.addEventListener('touchend', onTouchEnd, { passive: true });
  desktopQuery.addEventListener('change', onBreakpointChange);

  return function destroy() {
    window.cancelAnimationFrame(focusFrame);

    if (isOpen) {
      setOpen(false, { restoreFocus: false });
    }

    toggle.removeEventListener('click', onToggleClick);
    closeButton?.removeEventListener('click', onCloseClick);
    overlay?.removeEventListener('click', onCloseClick);
    menuLinks.forEach((link) => link.removeEventListener('click', onLinkClick));
    document.removeEventListener('keydown', onKeydown);
    panel.removeEventListener('touchstart', onTouchStart);
    panel.removeEventListener('touchend', onTouchEnd);
    desktopQuery.removeEventListener('change', onBreakpointChange);
  };
}