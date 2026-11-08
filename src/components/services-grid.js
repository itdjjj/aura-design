/**
 * Aura Design: components/services-grid.js
 *
 * The Services and Investment section: renders one pricing card per service
 * from data/services.js, lets visitors open a card to see what is included,
 * and carries their choice to the consultation form.
 *
 * Markup it controls
 *   [data-services-grid]   the grid in index.html where the cards are rendered
 *
 * The card markup is documented in components.css, next to its styles. Each
 * card is an <article> with
 *   data-expanded="true|false"   whether the list of inclusions is open
 *   data-selected="true|false"   whether it is the visitor's chosen service
 *   data-featured="true|false"   the highlighted dark card
 *
 * What a visitor can do
 *   - "What is included" opens and closes a card's list. Cards open
 *     independently, so several can be compared side by side.
 *   - "Choose ..." selects the service and scrolls to the consultation form.
 *     On a screen with a mouse, focus lands on the first empty required field
 *     so they can simply start typing. On a touch screen focus goes to the
 *     form without opening the on-screen keyboard.
 *
 * Talking to the form (core/store.js)
 *   store.selectedServiceId is the single source of truth. This module sets it
 *   when a card is chosen, and listens to it, so the highlighted card also
 *   follows a choice made in the form's "Service of interest" menu.
 *   consultation-form.js does the opposite: it selects the matching menu option.
 *
 * Deep link
 *   /?service=full-service#contact opens the page with that service already
 *   chosen (and the form's menu preselected). It suits links in campaigns and
 *   emails. Unknown ids are ignored.
 *
 * Accessibility
 *   Each card is labelled by its heading. The "What is included" button
 *   reports aria-expanded and points to its list with aria-controls. A closed
 *   list is invisible to keyboards and screen readers (components.css). The
 *   chosen card's button changes its wording to "Continue to the form", which
 *   screen readers announce, so the selection is never colour-only.
 *
 * Prices come from data/services.js and are formatted as whole US dollars
 * ("$4,500"). They are always shown as starting prices, with a "from" label.
 */

import { delegate, html, render, setVisible } from '../core/dom.js';
import { scrollToTarget } from '../core/scroll.js';
import { store } from '../core/store.js';
import { getServiceById, services, servicesCurrency } from '../data/services.js';


/* ==========================================================================
   Constants
   ========================================================================== */

/** Wording of the call-to-action on the card that is currently chosen. */
const SELECTED_LABEL = 'Continue to the form';

/** The same prices read the same for every visitor, whatever their browser language. */
const PRICE_LOCALE = 'en-US';


/* ==========================================================================
   Rendering
   ========================================================================== */

/**
 * Formats a whole-number price, for example 4500 becomes "$4,500". If the
 * currency code in the data is not valid, the number is still shown.
 *
 * @param {number} amount
 * @returns {string}
 */
function formatPrice(amount) {
  try {
    return new Intl.NumberFormat(PRICE_LOCALE, {
      style: 'currency',
      currency: servicesCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${servicesCurrency} ${amount}`;
  }
}

/**
 * Markup for one service card.
 *
 * @param {import('../data/services.js').Service} service
 */
function renderCard(service) {
  const titleId = `service-${service.id}-title`;
  const detailsId = `service-${service.id}-details`;

  return html`
    <article
      class="service-card"
      data-reveal
      data-service-id="${service.id}"
      data-expanded="false"
      data-selected="false"
      data-featured="${String(Boolean(service.featured))}"
      aria-labelledby="${titleId}"
    >
      ${service.tag && html`<p class="service-card__tag">${service.tag}</p>`}

      <h3 id="${titleId}" class="service-card__title">${service.title}</h3>

      <p class="service-card__price">
        <span class="service-card__from">from</span> ${formatPrice(service.price.amount)}
        <span class="service-card__unit">${service.price.unit}</span>
      </p>

      <p class="service-card__summary">${service.summary}</p>

      <button
        type="button"
        class="service-card__toggle"
        data-service-toggle
        aria-expanded="false"
        aria-controls="${detailsId}"
      >
        What is included
      </button>

      <div class="service-card__details" id="${detailsId}">
        <div>
          <ul class="service-card__list">
            ${service.features.map((feature) => html`<li>${feature}</li>`)}
          </ul>
        </div>
      </div>

      <button type="button" class="btn btn-outline-dark service-card__cta" data-service-choose>
        ${service.ctaLabel}
      </button>
    </article>
  `;
}


/* ==========================================================================
   Scrolling to the form
   ========================================================================== */

/**
 * Finishes the scroll-reveal of the block around an element, immediately.
 *
 * The form sits in a block that fades up 28px as it scrolls into view. If the
 * page scrolled to the form while that block was still waiting, it would
 * measure the form 28px too low and then stop 28px too high once the block
 * settled. Showing the block first (with its transition off for one frame)
 * means the page scrolls to where the form really will be.
 *
 * @param {HTMLElement} element
 */
function showAtOnce(element) {
  const block = element.closest('[data-reveal]');

  if (!(block instanceof HTMLElement) || block.classList.contains('is-visible')) {
    return;
  }

  block.style.transition = 'none';
  block.classList.add('is-visible');

  // Reading offsetHeight makes the browser apply the change before we measure
  void block.offsetHeight;

  requestAnimationFrame(() => block.style.removeProperty('transition'));
}


/* ==========================================================================
   Public entry point
   ========================================================================== */

/**
 * Starts the services grid.
 *
 * @returns {(() => void) | undefined} Teardown function, or undefined when the
 *   page has no services grid.
 */
export function initServicesGrid() {
  const grid = document.querySelector('[data-services-grid]');

  if (!(grid instanceof HTMLElement)) {
    return undefined;
  }

  render(grid, services.map(renderCard));

  /** Cards by service id. */
  /** @type {Map<string, HTMLElement>} */
  const cards = new Map();

  grid.querySelectorAll('.service-card').forEach((card) => {
    if (card instanceof HTMLElement && card.dataset.serviceId) {
      cards.set(card.dataset.serviceId, card);
    }
  });


  /* ----- Opening a card --------------------------------------------------- */

  /**
   * Opens or closes a card's list of inclusions.
   *
   * @param {HTMLElement} card
   * @param {HTMLElement} toggle  The card's "What is included" button.
   */
  function toggleCard(card, toggle) {
    const expanded = card.dataset.expanded !== 'true';

    card.dataset.expanded = String(expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
  }


  /* ----- Choosing a service ----------------------------------------------- */

  /**
   * Highlights the chosen card, and gives every other card its normal wording
   * back. Runs whenever the store changes, wherever the choice was made.
   *
   * @param {string | null} selectedId
   */
  function applySelection(selectedId) {
    cards.forEach((card, id) => {
      const selected = id === selectedId;
      const cta = card.querySelector('[data-service-choose]');

      card.dataset.selected = String(selected);

      if (cta) {
        cta.textContent = selected ? SELECTED_LABEL : (getServiceById(id)?.ctaLabel ?? '');
      }
    });
  }

  /**
   * Scrolls to the consultation form and puts focus in the right place.
   */
  function goToForm() {
    const form = document.querySelector('[data-consultation-form]');
    const card = form?.parentElement;

    if (!(form instanceof HTMLFormElement) || !(card instanceof HTMLElement)) {
      // No form on this page: take the visitor to the contact section instead
      scrollToTarget('contact');
      return;
    }

    showAtOnce(card);

    // A mouse means a keyboard is at hand: land on the first empty required
    // field. A touch screen would pop up its keyboard and jolt the page, so
    // there focus goes to the form's panel instead.
    const hasMouse = window.matchMedia('(pointer: fine)').matches;

    scrollToTarget(card, { focus: !hasMouse });

    if (hasMouse) {
      const nextField = Array.from(form.querySelectorAll('[data-rules]')).find(
        (field) =>
          (field instanceof HTMLInputElement ||
            field instanceof HTMLSelectElement ||
            field instanceof HTMLTextAreaElement) &&
          field.type !== 'checkbox' &&
          (field.dataset.rules ?? '').includes('required') &&
          field.value.trim() === '',
      );

      if (nextField instanceof HTMLElement) {
        nextField.focus({ preventScroll: true });
      }
    }
  }

  /**
   * A "Choose ..." button was pressed.
   *
   * @param {Event} event
   * @param {Element} button
   */
  function onChoose(event, button) {
    const serviceId = button.closest('.service-card')?.getAttribute('data-service-id');

    if (!serviceId) {
      return;
    }

    store.setState({ selectedServiceId: serviceId });
    goToForm();
  }

  /**
   * A "What is included" button was pressed.
   *
   * @param {Event} event
   * @param {Element} button
   */
  function onToggle(event, button) {
    const card = button.closest('.service-card');

    if (card instanceof HTMLElement && button instanceof HTMLElement) {
      toggleCard(card, button);
    }
  }

  const cleanups = [
    delegate(grid, 'click', '[data-service-toggle]', onToggle),
    delegate(grid, 'click', '[data-service-choose]', onChoose),
  ];


  /* ----- Start ------------------------------------------------------------ */

  // A link such as /?service=full-service#contact starts with that service chosen
  const requested = new URLSearchParams(window.location.search).get('service')?.toLowerCase() ?? '';

  if (getServiceById(requested)) {
    store.setState({ selectedServiceId: requested });
  }

  // immediate: reflect a choice that was already made (the deep link above)
  cleanups.push(store.subscribe('selectedServiceId', applySelection, { immediate: true }));

  return function destroy() {
    cleanups.forEach((cleanup) => cleanup());
  };
}