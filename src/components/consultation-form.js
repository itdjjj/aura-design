/**
 * Aura Design: components/consultation-form.js
 *
 * Behaviour for the consultation request form in the #contact section.
 * It connects the markup in index.html to the rules engine in
 * core/validator.js, shows the validation states styled in components.css,
 * sends the request, and shows the thank-you panel.
 *
 * Markup it controls (all in index.html)
 *   form[data-consultation-form]   the form. Rules live in data-rules attributes.
 *   [data-field]                   wrapper of one field. Gets data-state="valid"
 *                                  or "invalid", and data-shake="true" briefly
 *                                  after a failed submit (styled in components.css).
 *   [data-error]                   message line inside each wrapper.
 *   [data-form-summary]            error summary above the fields.
 *   [data-char-counter]            the textarea, with [data-char-count] beside it.
 *   [data-submit]                  submit button with [data-submit-label] and
 *                                  [data-submit-spinner]. aria-busy="true" while sending.
 *   [data-form-success]            thank-you panel, with [data-success-name]
 *                                  and a [data-form-reset] button.
 *   input[name="companyWebsite"]   honeypot, invisible to people.
 *
 * Validation behaviour: reward early, punish late
 *   - Typing never shows an error on a field the visitor has not left yet.
 *   - Leaving a field (blur) validates it, if the visitor typed in it.
 *     Tabbing straight through an empty field says nothing.
 *   - Menus and the checkbox validate the moment they change.
 *   - Once a field has been validated, it re-validates on every keystroke, so
 *     its message clears the instant the problem is fixed.
 *   - Optional fields that are empty show no state at all (no green tick).
 *   - Submitting validates everything, lists the problems in the summary
 *     (each one links to its field), nudges the invalid fields, and moves
 *     focus to the first one. The summary updates itself as problems are fixed.
 *
 * Sending
 *   See FORM_CONFIG below. IMPORTANT: until FORM_CONFIG.endpoint is set, a
 *   production build refuses to send and shows the visitor the studio's
 *   email and phone, so a missing connection is noticed during testing and no
 *   enquiry is silently lost. During development (npm run dev) the send is
 *   simulated and the payload is printed to the browser console.
 *
 * Spam
 *   The honeypot catches simple bots: if it is filled in, the form pretends to
 *   succeed and sends nothing.
 *
 * Talking to other components (core/store.js)
 *   store.selectedServiceId   services-grid.js sets it when a service is
 *                             chosen. This form selects the matching option
 *                             in "Service of interest". Changing that menu by
 *                             hand updates the store, so the pricing cards
 *                             stay in sync. The store is cleared after a send.
 *   EVENTS.FORM_SUBMITTED     emitted after a successful send, with the chosen
 *                             service and budget ids only (no personal data).
 *
 * Accessibility
 *   Errors set aria-invalid and are linked through aria-describedby (already
 *   in the markup). The summary is a role="alert" region. While the thank-you
 *   panel is open, the form underneath is made inert so keyboards and screen
 *   readers cannot reach it.
 */

import { delegate, html, on, prefersReducedMotion, render, setVisible, wait } from '../core/dom.js';
import { EVENTS, events, store } from '../core/store.js';
import { getFieldValue, validateField } from '../core/validator.js';
import { getServiceById } from '../data/services.js';


/* ==========================================================================
   Configuration
   ========================================================================== */

/**
 * Where and how the request is sent. Edit this block when the backend is
 * chosen. Nothing else in the file needs to change.
 *
 *   endpoint     The URL that receives the request. Examples:
 *                  Formspree  https://formspree.io/f/your-form-id
 *                  Web3Forms  https://api.web3forms.com/submit
 *                  Your own   https://api.example.com/consultations
 *                Leave empty until the backend exists (see the file header).
 *   format       "json" for a JSON body, or "urlencoded" for a classic form
 *                body. Formspree and Web3Forms accept JSON. (Netlify Forms
 *                needs "urlencoded", a matching static form in the HTML, and
 *                a "form-name" entry in extraFields.)
 *   extraFields  Extra values added to every request, such as an access key:
 *                  { access_key: 'your-key', subject: 'New consultation request' }
 *   timeoutMs    How long to wait before giving up and showing the error.
 */
export const FORM_CONFIG = Object.freeze({
  endpoint: '',
  format: 'json',
  extraFields: Object.freeze({}),
  timeoutMs: 15000,
});

/** Shown to visitors when sending fails. Keep in sync with index.html. */
const CONTACT = Object.freeze({
  email: 'studio@auradesign.studio',
  phoneDisplay: '+1 (212) 555-0147',
  phoneHref: '+12125550147',
});

const BUSY_LABEL = 'Sending...';
const SHAKE_DURATION_MS = 450;
const SIMULATED_DELAY_MS = 900;


/* ==========================================================================
   Sending
   ========================================================================== */

/**
 * Sends the request to the configured endpoint.
 *
 * @param {Record<string, string | boolean>} payload
 * @returns {Promise<void>} Resolves on success, rejects on any failure.
 */
async function sendPayload(payload) {
  const { endpoint, format, extraFields, timeoutMs } = FORM_CONFIG;

  if (!endpoint) {
    // Vite replaces import.meta.env.DEV with true only in "npm run dev"
    if (import.meta.env?.DEV) {
      console.info('[Aura Design] No form endpoint is set, so this send was simulated:', payload);
      await wait(SIMULATED_DELAY_MS);
      return;
    }

    throw new Error(
      'No form endpoint is configured. Set FORM_CONFIG.endpoint in src/components/consultation-form.js.',
    );
  }

  const body = { ...payload, ...extraFields };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    /** @type {RequestInit} */
    const request = {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    };

    if (format === 'urlencoded') {
      request.body = new URLSearchParams(
        Object.entries(body).map(([key, value]) => [key, String(value)]),
      );
    } else {
      request.headers = { ...request.headers, 'Content-Type': 'application/json' };
      request.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, request);

    if (!response.ok) {
      throw new Error(`The form endpoint answered with status ${response.status}.`);
    }
  } finally {
    window.clearTimeout(timer);
  }
}


/* ==========================================================================
   Component
   ========================================================================== */

/**
 * @typedef {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} FieldControl
 *
 * @typedef {Object} Field
 * @property {HTMLElement} wrapper   The [data-field] element.
 * @property {FieldControl} input    The control that has data-rules.
 * @property {HTMLElement} error     The [data-error] message line.
 * @property {string} name           The control's name attribute.
 * @property {boolean} dirty         The visitor has changed it.
 * @property {boolean} validated     It has been validated at least once.
 */

/**
 * Starts the consultation form.
 *
 * @returns {(() => void) | undefined} Teardown function, or undefined when the
 *   page has no form.
 */
export function initConsultationForm() {
  const form = document.querySelector('[data-consultation-form]');

  if (!(form instanceof HTMLFormElement)) {
    return undefined;
  }

  const summary = form.querySelector('[data-form-summary]');
  const submitButton = form.querySelector('[data-submit]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const submitSpinner = form.querySelector('[data-submit-spinner]');
  const success = document.querySelector('[data-form-success]');

  if (
    !(summary instanceof HTMLElement) ||
    !(submitButton instanceof HTMLElement) ||
    !(success instanceof HTMLElement)
  ) {
    console.warn('[Aura Design] The consultation form is missing required markup and was not started.');
    return undefined;
  }

  const successName = success.querySelector('[data-success-name]');
  const resetButton = success.querySelector('[data-form-reset]');
  const honeypot = form.querySelector('input[name="companyWebsite"]');
  const nameInput = form.querySelector('input[name="fullName"]');
  const serviceSelect = form.querySelector('select[name="service"]');
  const budgetSelect = form.querySelector('select[name="budget"]');
  const counterInput = form.querySelector('[data-char-counter]');
  const countElement = form.querySelector('[data-char-count]');

  const idleLabel = submitLabel?.textContent ?? '';

  /** @type {Field[]} */
  const fields = [];

  /** @type {Map<Element, Field>} */
  const fieldByInput = new Map();

  form.querySelectorAll('[data-field]').forEach((wrapper) => {
    const input = wrapper.querySelector('[data-rules]');
    const error = wrapper.querySelector('[data-error]');

    if (
      !(wrapper instanceof HTMLElement) ||
      !(error instanceof HTMLElement) ||
      !(
        input instanceof HTMLInputElement ||
        input instanceof HTMLSelectElement ||
        input instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    /** @type {Field} */
    const field = {
      wrapper,
      input,
      error,
      name: input.name || input.id,
      dirty: false,
      validated: false,
    };

    // Message lines are announced politely when their text changes
    error.setAttribute('aria-live', 'polite');

    fields.push(field);
    fieldByInput.set(input, field);
  });

  // Programmatic focus on these panels should not draw a ring around the whole box
  summary.style.outline = 'none';
  success.style.outline = 'none';

  /** @type {Map<HTMLElement, number>} */
  const shakeTimers = new Map();

  /** 'validation' while the summary lists field problems, 'error' after a failed send. */
  let summaryMode = null;
  let summaryKey = '';
  let isSubmitting = false;

  const behavior = () => (prefersReducedMotion() ? 'auto' : 'smooth');


  /* ----- Field states ---------------------------------------------------- */

  /**
   * Puts a field back to its untouched look.
   *
   * @param {Field} field
   */
  function clearField(field) {
    const { wrapper, input, error } = field;

    error.textContent = '';
    setVisible(error, false);
    input.removeAttribute('aria-invalid');

    delete wrapper.dataset.state;
    delete wrapper.dataset.shake;

    window.clearTimeout(shakeTimers.get(wrapper));
    shakeTimers.delete(wrapper);

    field.dirty = false;
    field.validated = false;
  }

  /**
   * Shows a validation result on a field.
   *
   * @param {Field} field
   * @param {{ valid: boolean, message: string }} result
   */
  function renderField(field, result) {
    const { wrapper, input, error } = field;

    if (result.valid) {
      error.textContent = '';
      setVisible(error, false);
      input.removeAttribute('aria-invalid');

      // An empty optional field is neither right nor wrong, so it shows nothing
      if (getFieldValue(input) === '') {
        delete wrapper.dataset.state;
      } else {
        wrapper.dataset.state = 'valid';
      }

      return;
    }

    error.textContent = result.message;
    setVisible(error, true);
    input.setAttribute('aria-invalid', 'true');
    wrapper.dataset.state = 'invalid';
  }

  /**
   * Validates one field and shows the result.
   *
   * @param {Field} field
   * @returns {{ valid: boolean, rule: string, message: string }}
   */
  function validate(field) {
    const result = validateField(field.input);

    field.validated = true;
    renderField(field, result);
    refreshSummary();

    return result;
  }

  /**
   * Plays the short nudge on a field. Restarts cleanly if it is already playing.
   *
   * @param {Field} field
   */
  function shake(field) {
    const { wrapper } = field;

    window.clearTimeout(shakeTimers.get(wrapper));
    delete wrapper.dataset.shake;

    // Reading offsetWidth forces a reflow, so the animation can start again
    void wrapper.offsetWidth;

    wrapper.dataset.shake = 'true';

    shakeTimers.set(
      wrapper,
      window.setTimeout(() => {
        delete wrapper.dataset.shake;
        shakeTimers.delete(wrapper);
      }, SHAKE_DURATION_MS),
    );
  }

  /**
   * Moves focus to a field and brings it to the middle of the screen, clear of
   * the fixed header.
   *
   * @param {Field} field
   */
  function focusField(field) {
    field.input.focus({ preventScroll: true });
    field.input.scrollIntoView({ block: 'center', behavior: behavior() });
  }


  /* ----- Summary --------------------------------------------------------- */

  function hideSummary() {
    summary.replaceChildren();
    setVisible(summary, false);
    summaryMode = null;
    summaryKey = '';
  }

  /**
   * Lists the invalid fields in the summary. Skips the redraw when the list is
   * unchanged, so screen readers are not told the same thing repeatedly.
   *
   * @param {Field[]} invalidFields
   */
  function showValidationSummary(invalidFields) {
    const items = invalidFields.map((field) => ({
      id: field.input.id,
      message: field.error.textContent ?? '',
    }));

    const key = items.map((item) => `${item.id}:${item.message}`).join('|');

    if (summaryMode === 'validation' && key === summaryKey) {
      return;
    }

    summaryMode = 'validation';
    summaryKey = key;

    const heading =
      items.length === 1
        ? 'Please fix this before sending:'
        : `Please fix these ${items.length} things before sending:`;

    render(
      summary,
      html`
        <p class="font-medium">${heading}</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          ${items.map(
            (item) => html`
              <li>
                <a
                  href="#${item.id}"
                  data-field-link="${item.id}"
                  class="underline underline-offset-2 hover:no-underline"
                  >${item.message}</a
                >
              </li>
            `,
          )}
        </ul>
      `,
    );

    setVisible(summary, true);
  }

  /** Keeps a visible validation summary in step with the fields as they are fixed. */
  function refreshSummary() {
    if (summaryMode !== 'validation') {
      return;
    }

    const invalidFields = fields.filter((field) => field.wrapper.dataset.state === 'invalid');

    if (invalidFields.length) {
      showValidationSummary(invalidFields);
    } else {
      hideSummary();
    }
  }

  /**
   * Tells the visitor the send failed and how else to reach the studio.
   *
   * @param {boolean} isOffline
   */
  function showFailureSummary(isOffline) {
    summaryMode = 'error';
    summaryKey = '';

    const headline = isOffline
      ? 'You appear to be offline, so we could not send your request.'
      : 'Sorry, we could not send your request just now.';

    render(
      summary,
      html`
        <p class="font-medium">${headline}</p>
        <p class="mt-1">
          Please try again in a moment, or contact us directly at
          <a href="mailto:${CONTACT.email}" class="underline underline-offset-2 hover:no-underline"
            >${CONTACT.email}</a
          >
          or
          <a href="tel:${CONTACT.phoneHref}" class="underline underline-offset-2 hover:no-underline"
            >${CONTACT.phoneDisplay}</a
          >.
        </p>
      `,
    );

    setVisible(summary, true);
    summary.focus();
  }


  /* ----- Character counter ----------------------------------------------- */

  function updateCharCount() {
    if (!(counterInput instanceof HTMLTextAreaElement) || !countElement) {
      return;
    }

    const length = counterInput.value.length;
    const limit = Number(counterInput.getAttribute('maxlength')) || Infinity;

    countElement.textContent = String(length);

    // Calm grey, a bronze warning near the limit, red at the limit
    let tone = 'text-stone';

    if (length >= limit) {
      tone = 'text-error';
    } else if (length >= limit * 0.9) {
      tone = 'text-bronze';
    }

    const holder = countElement.parentElement;

    if (holder) {
      holder.classList.remove('text-stone', 'text-bronze', 'text-error');
      holder.classList.add(tone);
    }
  }


  /* ----- Service menu and the shared store ------------------------------- */

  /**
   * Selects a service in the menu when one was chosen in the pricing grid.
   *
   * @param {string | null} serviceId
   */
  function applyService(serviceId) {
    if (!serviceId || !(serviceSelect instanceof HTMLSelectElement)) {
      return;
    }

    const hasOption = Array.from(serviceSelect.options).some((option) => option.value === serviceId);

    if (!hasOption || serviceSelect.value === serviceId) {
      return;
    }

    serviceSelect.value = serviceId;

    const field = fieldByInput.get(serviceSelect);

    if (field) {
      field.dirty = true;
      validate(field);
    }
  }

  /** Mirrors a hand-made menu choice into the store, so the pricing cards stay in sync. */
  function syncServiceToStore() {
    if (!(serviceSelect instanceof HTMLSelectElement)) {
      return;
    }

    const value = serviceSelect.value;

    // Only real services are shared. "I'm not sure yet" is not one.
    store.setState({ selectedServiceId: getServiceById(value) ? value : null });
  }


  /* ----- Submitting ------------------------------------------------------ */

  /** @param {boolean} busy */
  function setSubmitting(busy) {
    isSubmitting = busy;

    if (busy) {
      submitButton.setAttribute('aria-busy', 'true');
    } else {
      submitButton.removeAttribute('aria-busy');
    }

    setVisible(submitSpinner, busy);

    if (submitLabel) {
      submitLabel.textContent = busy ? BUSY_LABEL : idleLabel;
    }
  }

  /** Text of the chosen option, which reads better in an email than the value. */
  function optionLabel(select) {
    return select instanceof HTMLSelectElement
      ? (select.selectedOptions[0]?.textContent ?? '').trim()
      : '';
  }

  /** @returns {Record<string, string | boolean>} */
  function collectPayload() {
    const value = (name) => {
      const control = form.elements.namedItem(name);

      return control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
        ? control.value.trim()
        : '';
    };

    return {
      fullName: value('fullName'),
      email: value('email'),
      phone: value('phone'),
      service: optionLabel(serviceSelect),
      budget: optionLabel(budgetSelect),
      message: value('message'),
      consent: true,
      page: window.location.href,
      submittedAt: new Date().toISOString(),
    };
  }

  /** Puts every field and the counter back to their start state. */
  function resetFormState() {
    form.reset();
    fields.forEach(clearField);
    hideSummary();
    updateCharCount();
  }

  /**
   * Shows the thank-you panel and clears the form behind it.
   *
   * @param {string} firstName
   */
  function showSuccess(firstName) {
    if (successName) {
      successName.textContent = firstName || 'friend';
    }

    resetFormState();
    store.setState({ selectedServiceId: null });

    // The panel covers the form, so keep keyboards and screen readers out of it
    form.setAttribute('inert', '');

    setVisible(success, true);
    success.focus();
  }

  /** Closes the thank-you panel and returns to an empty form. */
  function showFormAgain() {
    setVisible(success, false);
    form.removeAttribute('inert');

    if (fields[0]) {
      focusField(fields[0]);
    }
  }

  /** @param {SubmitEvent} event */
  async function onSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const results = fields.map((field) => ({ field, result: validate(field) }));
    const failed = results.filter(({ result }) => !result.valid).map(({ field }) => field);

    if (failed.length) {
      showValidationSummary(failed);
      failed.forEach(shake);
      focusField(failed[0]);
      return;
    }

    hideSummary();

    const firstName = (nameInput instanceof HTMLInputElement ? nameInput.value : '')
      .trim()
      .split(/\s+/)[0];

    // A filled honeypot means a bot: look successful, send nothing
    if (honeypot instanceof HTMLInputElement && honeypot.value.trim() !== '') {
      showSuccess(firstName);
      return;
    }

    if (navigator.onLine === false) {
      showFailureSummary(true);
      return;
    }

    const payload = collectPayload();
    const chosen = {
      service: serviceSelect instanceof HTMLSelectElement ? serviceSelect.value : '',
      budget: budgetSelect instanceof HTMLSelectElement ? budgetSelect.value : '',
    };

    setSubmitting(true);

    try {
      await sendPayload(payload);
    } catch (error) {
      console.error('[Aura Design] The consultation request could not be sent.', error);
      setSubmitting(false);
      showFailureSummary(false);
      return;
    }

    setSubmitting(false);
    showSuccess(firstName);
    events.emit(EVENTS.FORM_SUBMITTED, chosen);
  }


  /* ----- Field events ---------------------------------------------------- */

  /** @param {Event} event */
  function onInput(event) {
    if (event.target === counterInput) {
      updateCharCount();
    }

    const field = fieldByInput.get(/** @type {Element} */ (event.target));

    if (!field) {
      return;
    }

    field.dirty = true;

    // Only fields that have already been judged are re-judged while typing
    if (field.validated) {
      validate(field);
    }
  }

  /** @param {FocusEvent} event */
  function onFocusOut(event) {
    const field = fieldByInput.get(/** @type {Element} */ (event.target));

    if (!field || field.input.type === 'checkbox') {
      return;
    }

    // Tabbing through an untouched, empty field says nothing
    if (field.dirty || field.validated || getFieldValue(field.input) !== '') {
      validate(field);
    }
  }

  /** @param {Event} event */
  function onChange(event) {
    const field = fieldByInput.get(/** @type {Element} */ (event.target));

    if (!field) {
      return;
    }

    const { input } = field;

    // Discrete choices are judged at once. Text is judged when the visitor leaves it.
    if (input instanceof HTMLSelectElement || input.type === 'checkbox') {
      field.dirty = true;
      validate(field);
    }

    if (input === serviceSelect) {
      syncServiceToStore();
    }
  }

  /**
   * A problem in the summary was clicked: go to its field.
   *
   * @param {Event} event
   * @param {Element} link
   */
  function onSummaryLink(event, link) {
    event.preventDefault();

    const input = document.getElementById(link.getAttribute('data-field-link') ?? '');
    const field = input ? fieldByInput.get(input) : undefined;

    if (field) {
      focusField(field);
    }
  }


  /* ----- Wiring ---------------------------------------------------------- */

  const cleanups = [
    on(form, 'submit', onSubmit),
    on(form, 'input', onInput),
    on(form, 'focusout', onFocusOut),
    on(form, 'change', onChange),
    delegate(summary, 'click', 'a[data-field-link]', onSummaryLink),
    store.subscribe('selectedServiceId', applyService, { immediate: true }),
  ];

  if (resetButton) {
    cleanups.push(on(resetButton, 'click', showFormAgain));
  }

  // The browser may restore typed text (back button), so show the true count
  updateCharCount();

  return function destroy() {
    cleanups.forEach((cleanup) => cleanup());
    shakeTimers.forEach((timer) => window.clearTimeout(timer));
    shakeTimers.clear();
  };
}