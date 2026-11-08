/**
 * Aura Design: core/dom.js
 *
 * Small, dependency-free helpers for finding, creating, templating and
 * listening to DOM elements. Every component imports from here instead of
 * repeating the same querySelector and addEventListener boilerplate.
 *
 * Contents
 *   Selecting      qs, qsa, qsRequired
 *   Events         on, delegate
 *   Safe templates escapeHtml, raw, html, sanitizeUrl, toFragment, render
 *   Creating       createElement
 *   Visibility     setVisible
 *   Focus          getFocusable
 *   Page state     lockScroll, unlockScroll, prefersReducedMotion
 *   Timing         nextFrame, wait
 *
 * Safe templates: content rendered from the data files goes through the
 * html`...` tag. Every interpolated value is HTML-escaped automatically, so a
 * title like "Tom & Jerry <b>" can never break the markup or inject a script.
 * Always put interpolated attribute values inside double quotes.
 */


/* ==========================================================================
   Selecting
   ========================================================================== */

/**
 * First element matching a selector, or null.
 *
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {Element | null}
 */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * All elements matching a selector, as a real array (so map, filter and
 * find work directly).
 *
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {Element[]}
 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Like qs, but throws a clear error when the element is missing. Use it for
 * markup a component cannot work without.
 *
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {Element}
 */
export function qsRequired(selector, root = document) {
  const element = root.querySelector(selector);

  if (!element) {
    throw new Error(`Required element not found: "${selector}"`);
  }

  return element;
}


/* ==========================================================================
   Events
   ========================================================================== */

/**
 * Adds an event listener and returns a function that removes it again.
 *
 * @param {EventTarget} target
 * @param {string} type
 * @param {EventListenerOrEventListenerObject} handler
 * @param {boolean | AddEventListenerOptions} [options]
 * @returns {() => void} Call to remove the listener.
 */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);

  return () => target.removeEventListener(type, handler, options);
}

/**
 * Event delegation: one listener on a container handles events for matching
 * descendants, including ones added later (such as cards rendered by
 * JavaScript). For events that do not bubble (focus, blur), pass
 * { capture: true } as the options.
 *
 * @param {Element | Document} root
 * @param {string} type
 * @param {string} selector   Matched against the event target and its ancestors.
 * @param {(event: Event, match: Element) => void} handler
 * @param {boolean | AddEventListenerOptions} [options]
 * @returns {() => void} Call to remove the listener.
 */
export function delegate(root, type, selector, handler, options) {
  const listener = (event) => {
    const origin = event.target instanceof Element ? event.target : null;
    const match = origin ? origin.closest(selector) : null;

    if (match && root.contains(match)) {
      handler(event, match);
    }
  };

  return on(root, type, listener, options);
}


/* ==========================================================================
   Safe templates
   ========================================================================== */

/** Marks a string as trusted HTML that must not be escaped again. */
class SafeHtml {
  /** @param {string} value */
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const ESCAPE_MAP = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/**
 * Escapes the characters that are special in HTML text and quoted attributes.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPE_MAP[character]);
}

/**
 * Marks a string as trusted HTML so html`...` inserts it as is. Only use it
 * for markup you wrote yourself (for example an inline SVG), never for text
 * that comes from data or from visitors.
 *
 * @param {string} value
 * @returns {SafeHtml}
 */
export function raw(value) {
  return new SafeHtml(String(value));
}

/**
 * Converts one interpolated value into safe markup text.
 *
 * @param {unknown} value
 * @returns {string}
 */
function toSafeString(value) {
  if (value === null || value === undefined || value === false || value === true) {
    return '';
  }

  if (value instanceof SafeHtml) {
    return value.value;
  }

  if (Array.isArray(value)) {
    return value.map(toSafeString).join('');
  }

  return escapeHtml(value);
}

/**
 * Tagged template that builds markup with every interpolated value escaped.
 *
 * - null, undefined, true and false render nothing, so
 *   ${condition && html`<p>...</p>`} works as a conditional.
 * - Arrays are joined, so ${items.map((item) => html`<li>${item}</li>`)}
 *   works as a loop.
 * - Results of other html`...` calls are inserted as markup, not as text.
 *
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {SafeHtml}
 */
export function html(strings, ...values) {
  let output = strings[0];

  values.forEach((value, index) => {
    output += toSafeString(value) + strings[index + 1];
  });

  return new SafeHtml(output);
}

/**
 * Allows only web, mail and phone links and relative paths. Anything else
 * (such as a "javascript:" URL) becomes "#". Use it on any URL taken from data
 * before putting it in an href.
 *
 * @param {string} url
 * @returns {string}
 */
export function sanitizeUrl(url) {
  const value = String(url).trim();

  if (/^(?:https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(value)) {
    return value;
  }

  // A value with no scheme at all, such as "images/a.jpg", is a relative path
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return value;
  }

  return '#';
}

/**
 * Turns markup into a DocumentFragment without running scripts or loading
 * resources early (the template element keeps its content inert until it is
 * inserted).
 *
 * Plain strings are treated as text, not markup, so passing untrusted text
 * here is safe. Use html`...` or raw() to pass markup.
 *
 * @param {SafeHtml | string} content
 * @returns {DocumentFragment}
 */
export function toFragment(content) {
  const template = document.createElement('template');

  template.innerHTML = content instanceof SafeHtml ? content.value : escapeHtml(content);

  return template.content;
}

/**
 * Replaces the children of a container with new content.
 *
 * @param {Element} container
 * @param {SafeHtml | Node | string | Array<SafeHtml | Node | string>} content
 * @returns {Element} The container, for chaining.
 */
export function render(container, content) {
  const items = Array.isArray(content) ? content : [content];
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    if (item instanceof Node) {
      fragment.append(item);
    } else if (item !== null && item !== undefined && item !== false) {
      fragment.append(toFragment(item));
    }
  });

  container.replaceChildren(fragment);

  return container;
}


/* ==========================================================================
   Creating elements
   ========================================================================== */

/**
 * @typedef {Object} ElementOptions
 * @property {string | string[]} [className]   Class names, as a string or array.
 * @property {Record<string, string | number | boolean | null | undefined>} [attrs]
 *   Attributes. true sets a boolean attribute, false or null/undefined skips it.
 * @property {Record<string, string | number>} [dataset]  data-* attributes in camelCase.
 * @property {string} [text]                   Text content (always escaped).
 * @property {Record<string, EventListener>} [on]  Event listeners by event name.
 */

/**
 * Creates an element in one call.
 *
 * @example
 * const button = createElement('button', {
 *   className: 'btn btn-primary',
 *   attrs: { type: 'button', 'aria-expanded': false },
 *   dataset: { serviceId: 'full-service' },
 *   text: 'Choose',
 *   on: { click: handleClick },
 * });
 *
 * @param {string} tag
 * @param {ElementOptions} [options]
 * @param {Array<Node | string>} [children]  Nodes, or strings added as text.
 * @returns {HTMLElement}
 */
export function createElement(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  const { className, attrs, dataset, text, on: listeners } = options;

  if (className) {
    const names = Array.isArray(className) ? className : className.split(/\s+/);
    element.classList.add(...names.filter(Boolean));
  }

  if (attrs) {
    Object.entries(attrs).forEach(([name, value]) => {
      if (value === false || value === null || value === undefined) {
        return;
      }

      element.setAttribute(name, value === true ? '' : String(value));
    });
  }

  if (dataset) {
    Object.entries(dataset).forEach(([name, value]) => {
      element.dataset[name] = String(value);
    });
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  if (listeners) {
    Object.entries(listeners).forEach(([type, handler]) => {
      element.addEventListener(type, handler);
    });
  }

  children.forEach((child) => {
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });

  return element;
}


/* ==========================================================================
   Visibility
   ========================================================================== */

/**
 * Shows or hides an element. index.html hides some elements with the hidden
 * attribute (form error messages) and others with the "hidden" utility class
 * (success panel, empty state, spinner), so this sets both and either kind of
 * element works the same way.
 *
 * @param {HTMLElement | null} element
 * @param {boolean} visible
 */
export function setVisible(element, visible) {
  if (!element) {
    return;
  }

  element.hidden = !visible;
  element.classList.toggle('hidden', !visible);
}


/* ==========================================================================
   Focus
   ========================================================================== */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keyboard-focusable elements inside a container, in DOM order. Skips
 * elements that are not rendered (display: none) and anything inside an
 * inert region. Used for focus traps in dialogs.
 *
 * @param {Element} container
 * @returns {HTMLElement[]}
 */
export function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element instanceof HTMLElement &&
      element.getClientRects().length > 0 &&
      !element.closest('[inert]'),
  );
}


/* ==========================================================================
   Page state
   ========================================================================== */

let scrollLockCount = 0;

/**
 * @param {boolean} locked
 */
function applyScrollLock(locked) {
  document.documentElement.classList.toggle('scroll-locked', locked);
  document.body.classList.toggle('scroll-locked', locked);
}

/**
 * Stops the page behind a dialog from scrolling. Calls are counted, so two
 * overlays that overlap in time do not unlock the page too early: the page
 * unlocks only after every lockScroll() has had a matching unlockScroll().
 * The "scroll-locked" class is defined in main.css.
 */
export function lockScroll() {
  scrollLockCount += 1;

  if (scrollLockCount === 1) {
    applyScrollLock(true);
  }
}

/** Releases one scroll lock taken with lockScroll(). */
export function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);

  if (scrollLockCount === 0) {
    applyScrollLock(false);
  }
}

/**
 * True when the visitor's system asks for reduced motion. Read it at the
 * moment you need it, because visitors can change the setting at any time.
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}


/* ==========================================================================
   Timing
   ========================================================================== */

/**
 * Resolves on the next animation frame. Useful to let the browser apply a
 * style change before starting a transition.
 *
 * @returns {Promise<number>} The frame timestamp.
 */
export function nextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(resolve);
  });
}

/**
 * Resolves after a delay.
 *
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
export function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}