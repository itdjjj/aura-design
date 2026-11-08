/**
 * Aura Design: application entry point
 *
 * Loaded from index.html as <script type="module" src="/src/main.js">.
 * Stylesheets are linked from index.html (main.css, components.css), so they
 * are intentionally not imported here.
 *
 * This file only wires modules together. Each module exports one init
 * function that finds its own elements through data attributes, so a module
 * whose markup is missing from the page simply does nothing.
 *
 * Cross-component communication (for example "a service card was chosen, so
 * pre-select it in the form" or "open the lightbox on this project") goes
 * through the pub/sub store in core/store.js, never through direct imports
 * between components.
 */

// Core utilities
import { initScroll } from './core/scroll.js';
import { initReveal } from './core/observer.js';

// Layout
import { initHeader } from './layout/header.js';
import { initMobileMenu } from './layout/mobile-menu.js';
import { initFooter } from './layout/footer.js';

// Components
import { initHero } from './components/hero.js';
import { initLightbox } from './components/lightbox.js';
import { initPortfolioGallery } from './components/portfolio-gallery.js';
import { initServicesGrid } from './components/services-grid.js';
import { initConsultationForm } from './components/consultation-form.js';

/**
 * Initialisation order matters in three places:
 *  1. scroll before header and menu, which rely on smooth scrolling and the
 *     header offset it provides.
 *  2. lightbox before the gallery, so the gallery's open events are heard.
 *  3. reveal last, so cards rendered by the gallery and services modules are
 *     in the DOM when the observer starts watching [data-reveal] elements.
 */
const MODULES = [
  ['scroll', initScroll],
  ['header', initHeader],
  ['mobile-menu', initMobileMenu],
  ['footer', initFooter],
  ['hero', initHero],
  ['lightbox', initLightbox],
  ['portfolio-gallery', initPortfolioGallery],
  ['services-grid', initServicesGrid],
  ['consultation-form', initConsultationForm],
  ['reveal', initReveal],
];

const root = document.documentElement;

/**
 * The "js" class (added by the inline script in index.html) hides
 * [data-reveal] elements until they scroll into view. If the observer that
 * reveals them cannot run, remove the class so no content stays invisible.
 */
function restoreContentVisibility() {
  root.classList.remove('js');
}

/**
 * Runs one module's init function. A failure in one module is logged and
 * isolated so the rest of the page keeps working. Handles both sync and
 * async init functions.
 *
 * @param {string} name
 * @param {() => (void | Promise<void>)} init
 * @param {string[]} failed Collects the names of modules that threw
 */
function run(name, init, failed) {
  const onError = (error) => {
    failed.push(name);
    console.error(`[Aura Design] Module "${name}" failed to initialise.`, error);

    if (name === 'reveal') {
      restoreContentVisibility();
    }

    root.dataset.app = 'degraded';
  };

  try {
    const result = init();

    if (result && typeof result.then === 'function') {
      result.catch(onError);
    }
  } catch (error) {
    onError(error);
  }
}

function boot() {
  // Without IntersectionObserver there is no way to trigger reveals or lazy
  // loading, so show everything immediately instead of hiding it.
  if (!('IntersectionObserver' in window)) {
    restoreContentVisibility();
  }

  const failed = [];

  for (const [name, init] of MODULES) {
    run(name, init, failed);
  }

  // Useful hook for tests and for debugging in the browser inspector
  if (!failed.length) {
    root.dataset.app = 'ready';
  }
}

// Module scripts are deferred, so the DOM is normally parsed already.
// This guard keeps the file safe if it is ever loaded another way.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}