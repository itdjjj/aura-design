/**
 * Aura Design: components/portfolio-gallery.js
 *
 * The portfolio section: renders one card per project from data/portfolio.js,
 * filters them by category, and opens the full-screen viewer.
 *
 * Markup it controls (all in index.html, section #portfolio)
 *   [data-portfolio-filters]   the row of filter buttons. Each button has
 *                              data-filter="all|residential|commercial|landscape"
 *                              and aria-pressed (which components.css styles).
 *   [data-portfolio-grid]      where the cards are rendered
 *   [data-portfolio-count]     the live "Showing 4 residential projects" line
 *   [data-portfolio-empty]     the message shown when a filter matches nothing
 *
 * The card markup is documented in components.css, next to its styles.
 *
 * How filtering works
 *   Every card is rendered once and stays in the page. Filtering only hides
 *   the cards that do not match (the is-filtered-out class from main.css) and
 *   plays a short staggered entrance on the cards that remain. Nothing is
 *   rebuilt, so photographs are never downloaded twice and the order always
 *   follows data/portfolio.js.
 *
 * Opening the viewer
 *   Activating a card emits EVENTS.LIGHTBOX_OPEN with the projects that are
 *   showing right now and the position of the one chosen, so the viewer steps
 *   through the same filtered list the visitor sees. lightbox.js does the rest.
 *
 * Deep link
 *   A link such as /?category=landscape#portfolio opens with that filter
 *   already applied. Unknown categories are ignored.
 *
 * Scroll reveal and lazy images
 *   Cards carry data-reveal and their photographs carry data-lazy, so
 *   core/observer.js fades them in as they scroll into view. Cards that appear
 *   because the visitor pressed a filter are shown at once instead, because
 *   the visitor is already looking at that part of the page.
 *
 * Accessibility
 *   Filter buttons are plain buttons with aria-pressed. The count line is a
 *   polite live region, so a screen reader announces the result of a filter.
 *   Each card's button has a full label ("View project: Linden House
 *   (Residential, Hudson Valley, New York, 2025)").
 */

import { delegate, html, on, prefersReducedMotion, render, sanitizeUrl, setVisible } from '../core/dom.js';
import { EVENTS, events } from '../core/store.js';
import {
  getCategoryLabel,
  getProjectsByCategory,
  isKnownCategory,
  portfolioProjects,
} from '../data/portfolio.js';


/* ==========================================================================
   Constants
   ========================================================================== */

/** Classes defined in main.css and components.css. */
const CLASS_HIDDEN = 'is-filtered-out';
const CLASS_ENTERING = 'is-entering';
const CLASS_REVEALED = 'is-visible';

/** Name of the keyframes behind animate-scale-in (tailwind.config.js). */
const ENTER_ANIMATION = 'scale-in';

/** Delay between one card and the next during the entrance. */
const STAGGER_STEP_MS = 70;
const STAGGER_MAX_MS = 420;

const DEFAULT_CATEGORY = 'all';


/* ==========================================================================
   Rendering
   ========================================================================== */

/**
 * Markup for one project card.
 *
 * @param {import('../data/portfolio.js').Project} project
 */
function renderCard(project) {
  const category = getCategoryLabel(project.category);
  const details = `${project.location}, ${project.year}`;
  const label = `View project: ${project.title} (${category}, ${details})`;

  return html`
    <article class="project-card" data-id="${project.id}" data-category="${project.category}" data-reveal>
      <button type="button" class="project-card__trigger" aria-label="${label}">
        <span class="project-card__media">
          <img
            class="project-card__image"
            data-lazy
            src="${sanitizeUrl(project.image.src)}"
            alt="${project.image.alt}"
            width="${project.image.width}"
            height="${project.image.height}"
            loading="lazy"
            decoding="async"
          />
        </span>
        <span class="project-card__body">
          <span class="project-card__category">${category}</span>
          <span class="project-card__title">${project.title}</span>
          <span class="project-card__meta">${details}</span>
        </span>
      </button>
    </article>
  `;
}

/**
 * The line above the grid, for example "Showing 4 residential projects".
 *
 * @param {string} categoryId
 * @param {number} count
 * @returns {string}
 */
function describeResult(categoryId, count) {
  if (!count) {
    return 'No projects found';
  }

  const noun = count === 1 ? 'project' : 'projects';

  if (categoryId === DEFAULT_CATEGORY) {
    return `Showing all ${count} ${noun}`;
  }

  return `Showing ${count} ${getCategoryLabel(categoryId).toLowerCase()} ${noun}`;
}


/* ==========================================================================
   Public entry point
   ========================================================================== */

/**
 * Starts the portfolio gallery.
 *
 * @returns {(() => void) | undefined} Teardown function, or undefined when the
 *   page has no gallery.
 */
export function initPortfolioGallery() {
  const grid = document.querySelector('[data-portfolio-grid]');
  const filters = document.querySelector('[data-portfolio-filters]');
  const countElement = document.querySelector('[data-portfolio-count]');
  const emptyElement = document.querySelector('[data-portfolio-empty]');

  if (!(grid instanceof HTMLElement)) {
    return undefined;
  }

  /** @type {string} */
  let activeCategory = DEFAULT_CATEGORY;

  /** Cards by project id, so filtering never searches the page. */
  /** @type {Map<string, HTMLElement>} */
  const cards = new Map();


  /* ----- Render once ------------------------------------------------------ */

  render(grid, portfolioProjects.map(renderCard));

  grid.querySelectorAll('.project-card').forEach((card) => {
    if (card instanceof HTMLElement && card.dataset.id) {
      cards.set(card.dataset.id, card);
    }
  });


  /* ----- Filtering -------------------------------------------------------- */

  /**
   * Plays the entrance on a card, restarting it if it is already playing.
   *
   * @param {HTMLElement} card
   * @param {number} position  The card's place among the visible ones.
   */
  function playEntrance(card, position) {
    card.classList.remove(CLASS_ENTERING);

    // Reading offsetWidth makes the browser apply the removal, so the animation restarts
    void card.offsetWidth;

    card.style.animationDelay = `${Math.min(position * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`;
    card.classList.add(CLASS_ENTERING);
  }

  /**
   * Shows the cards of one category and hides the rest.
   *
   * @param {string} categoryId
   * @param {{ animate?: boolean }} [options]
   */
  function applyFilter(categoryId, { animate = true } = {}) {
    activeCategory = categoryId;

    const matching = getProjectsByCategory(categoryId);
    const matchingIds = new Set(matching.map((project) => project.id));
    const shouldAnimate = animate && !prefersReducedMotion();

    let position = 0;

    cards.forEach((card, id) => {
      const isMatch = matchingIds.has(id);

      card.classList.toggle(CLASS_HIDDEN, !isMatch);

      if (!isMatch) {
        // A hidden card never finishes its entrance, so clear it here
        card.classList.remove(CLASS_ENTERING);
        card.style.animationDelay = '';
        return;
      }

      if (animate) {
        // The visitor pressed a button and is looking here: no waiting for scroll reveal
        card.classList.add(CLASS_REVEALED);
      }

      if (shouldAnimate) {
        playEntrance(card, position);
      }

      position += 1;
    });

    if (filters) {
      filters.querySelectorAll('[data-filter]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-filter') === categoryId));
      });
    }

    if (countElement) {
      countElement.textContent = describeResult(categoryId, matching.length);
    }

    setVisible(emptyElement instanceof HTMLElement ? emptyElement : null, matching.length === 0);
  }


  /* ----- Events ----------------------------------------------------------- */

  /**
   * A filter button was pressed.
   *
   * @param {Event} event
   * @param {Element} button
   */
  function onFilterClick(event, button) {
    const categoryId = button.getAttribute('data-filter') ?? '';

    if (!isKnownCategory(categoryId) || categoryId === activeCategory) {
      return;
    }

    applyFilter(categoryId);
  }

  /**
   * A card was activated: open the viewer on the projects now showing.
   *
   * @param {Event} event
   * @param {Element} trigger
   */
  function onCardClick(event, trigger) {
    const card = trigger.closest('.project-card');
    const projects = getProjectsByCategory(activeCategory);
    const index = projects.findIndex((project) => project.id === card?.getAttribute('data-id'));

    if (index === -1) {
      return;
    }

    events.emit(EVENTS.LIGHTBOX_OPEN, { projects: [...projects], index });
  }

  /**
   * An entrance animation finished: remove its class and delay, so the card
   * is left exactly as it was and hover effects are not slowed.
   *
   * @param {AnimationEvent} event
   */
  function onAnimationEnd(event) {
    const card = event.target;

    if (
      card instanceof HTMLElement &&
      card.classList.contains('project-card') &&
      event.animationName === ENTER_ANIMATION
    ) {
      card.classList.remove(CLASS_ENTERING);
      card.style.animationDelay = '';
    }
  }

  const cleanups = [
    delegate(grid, 'click', '.project-card__trigger', onCardClick),
    on(grid, 'animationend', onAnimationEnd),
  ];

  if (filters) {
    cleanups.push(delegate(filters, 'click', '[data-filter]', onFilterClick));
  }


  /* ----- Start ------------------------------------------------------------ */

  // A link such as /?category=landscape#portfolio starts with that filter on
  const requested = new URLSearchParams(window.location.search).get('category')?.toLowerCase() ?? '';
  const startCategory = isKnownCategory(requested) ? requested : DEFAULT_CATEGORY;

  // No entrance and no early reveal at the start: the cards scroll in like the rest of the page
  applyFilter(startCategory, { animate: false });

  return function destroy() {
    cleanups.forEach((cleanup) => cleanup());
  };
}