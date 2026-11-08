/**
 * Aura Design: core/store.js
 *
 * A tiny publish/subscribe module so components can talk to each other
 * without importing each other. Two tools, for two different jobs:
 *
 *  1. store   Shared STATE: a value that exists over time and that a component
 *             may need to read when it starts, such as "which service did the
 *             visitor choose". Subscribers are told when a value changes and
 *             can ask for the current value at any time.
 *
 *  2. events  One-off MESSAGES: something that happened once and has no
 *             lasting value, such as "open the lightbox on this project".
 *             Nothing is remembered, and only listeners present at the time
 *             hear it.
 *
 * Who uses what (so each side stays in sync):
 *
 *   store.selectedServiceId
 *     services-grid.js   sets it when a visitor chooses a service
 *     consultation-form.js  subscribes (immediate) and selects the matching
 *                        option in the "Service of interest" menu. After a
 *                        successful submit or reset, the form sets it back to
 *                        null, so choosing the same service again is noticed.
 *
 *   events LIGHTBOX_OPEN   portfolio-gallery.js emits it with the visible
 *                          projects and the index of the one that was clicked
 *   events LIGHTBOX_CLOSE  lightbox.js emits it after closing, so the page
 *                          can react (for example to restore focus)
 *   events FORM_SUBMITTED  consultation-form.js emits it after a successful
 *                          send: a single place to attach analytics later
 *
 * Rules that keep it predictable:
 *   - State is never changed in place. Call setState with new values, and
 *     replace objects and arrays instead of editing them.
 *   - setState ignores a value that did not change (compared with Object.is),
 *     so subscribers are only called for real changes.
 *   - Handlers run synchronously, in the order they subscribed. One handler
 *     throwing an error is logged and does not stop the others.
 *
 * Exports
 *   store, events        the two shared instances used by the whole site
 *   EVENTS               the event names, so nobody types them as strings
 *   createStore, createEmitter   factories, for tests or isolated use
 */


/* ==========================================================================
   State store
   ========================================================================== */

/**
 * Called when one key changes.
 *
 * @template V
 * @callback KeyHandler
 * @param {V} value           The new value.
 * @param {V} previousValue   The value before the change.
 * @param {Readonly<Record<string, any>>} state  The full state after the change.
 * @returns {void}
 */

/**
 * Called after any change, once per setState call.
 *
 * @callback AnyChangeHandler
 * @param {Readonly<Record<string, any>>} state          State after the change.
 * @param {Readonly<Record<string, any>>} previousState  State before the change.
 * @param {string[]} changedKeys                         Keys that changed.
 * @returns {void}
 */

/** Subscribes to every change instead of one key. */
const ANY_KEY = '*';

/**
 * Runs a handler and logs, instead of rethrowing, any error it throws, so one
 * faulty subscriber cannot break the others or the code that triggered it.
 *
 * @param {Function} handler
 * @param {unknown[]} args
 */
function safeCall(handler, args) {
  try {
    handler(...args);
  } catch (error) {
    console.error('[Aura Design] A store subscriber threw an error.', error);
  }
}

/**
 * Creates a store holding a flat state object.
 *
 * @template {Record<string, any>} S
 * @param {S} initialState  Every key the store will ever use, with its start value.
 * @returns {{
 *   getState: () => Readonly<S>,
 *   setState: (patch: Partial<S> | ((state: Readonly<S>) => Partial<S>)) => void,
 *   subscribe: {
 *     (key: '*', handler: AnyChangeHandler, options?: { immediate?: boolean }): () => void,
 *     <K extends keyof S>(key: K, handler: KeyHandler<S[K]>, options?: { immediate?: boolean }): () => void,
 *   },
 *   reset: () => void,
 * }}
 */
export function createStore(initialState) {
  const defaults = Object.freeze({ ...initialState });

  /** @type {Readonly<S>} */
  let state = defaults;

  /** @type {Map<string, Set<Function>>} */
  const subscribers = new Map();

  /** @returns {Readonly<S>} A frozen snapshot of the current state. */
  function getState() {
    return state;
  }

  /**
   * Merges new values into the state and tells subscribers what changed.
   * Pass a function to compute the patch from the current state.
   *
   * @param {Partial<S> | ((state: Readonly<S>) => Partial<S>)} patch
   */
  function setState(patch) {
    const changes = typeof patch === 'function' ? patch(state) : patch;

    if (!changes || typeof changes !== 'object') {
      return;
    }

    const previousState = state;
    const changedKeys = Object.keys(changes).filter(
      (key) => !Object.is(previousState[key], changes[key]),
    );

    if (!changedKeys.length) {
      return;
    }

    state = Object.freeze({ ...previousState, ...changes });

    // Per-key subscribers first, then the "any change" subscribers once.
    // Each set is copied so a handler may unsubscribe while it runs.
    changedKeys.forEach((key) => {
      const handlers = subscribers.get(key);

      if (handlers) {
        [...handlers].forEach((handler) => {
          safeCall(handler, [state[key], previousState[key], state]);
        });
      }
    });

    const anyHandlers = subscribers.get(ANY_KEY);

    if (anyHandlers) {
      [...anyHandlers].forEach((handler) => {
        safeCall(handler, [state, previousState, changedKeys]);
      });
    }
  }

  /**
   * Listens for changes to one key, or to any key with "*".
   *
   * @param {string} key
   * @param {Function} handler
   * @param {{ immediate?: boolean }} [options]
   *   immediate: also call the handler right now with the current value, so a
   *   component that starts late still sees a choice made earlier.
   * @returns {() => void} Call to unsubscribe.
   */
  function subscribe(key, handler, { immediate = false } = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError(`store.subscribe("${key}") needs a function as its handler.`);
    }

    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }

    subscribers.get(key).add(handler);

    if (immediate) {
      if (key === ANY_KEY) {
        safeCall(handler, [state, state, []]);
      } else {
        safeCall(handler, [state[key], state[key], state]);
      }
    }

    return function unsubscribe() {
      const handlers = subscribers.get(key);

      if (handlers) {
        handlers.delete(handler);

        if (!handlers.size) {
          subscribers.delete(key);
        }
      }
    };
  }

  /** Puts every key back to its start value, notifying subscribers of real changes. */
  function reset() {
    setState({ ...defaults });
  }

  return { getState, setState, subscribe, reset };
}


/* ==========================================================================
   Event emitter
   ========================================================================== */

/**
 * Creates a small event bus for one-off messages.
 *
 * @returns {{
 *   on: (type: string, handler: (payload?: any) => void) => () => void,
 *   once: (type: string, handler: (payload?: any) => void) => () => void,
 *   emit: (type: string, payload?: any) => void,
 *   clear: () => void,
 * }}
 */
export function createEmitter() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  /**
   * Listens for an event.
   *
   * @param {string} type
   * @param {(payload?: any) => void} handler
   * @returns {() => void} Call to stop listening.
   */
  function on(type, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`events.on("${type}") needs a function as its handler.`);
    }

    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }

    listeners.get(type).add(handler);

    return function off() {
      const handlers = listeners.get(type);

      if (handlers) {
        handlers.delete(handler);

        if (!handlers.size) {
          listeners.delete(type);
        }
      }
    };
  }

  /**
   * Listens for the next occurrence of an event only.
   *
   * @param {string} type
   * @param {(payload?: any) => void} handler
   * @returns {() => void} Call to cancel before the event happens.
   */
  function once(type, handler) {
    const off = on(type, (payload) => {
      off();
      handler(payload);
    });

    return off;
  }

  /**
   * Announces an event to everyone listening right now.
   *
   * @param {string} type
   * @param {any} [payload]
   */
  function emit(type, payload) {
    const handlers = listeners.get(type);

    if (!handlers) {
      return;
    }

    [...handlers].forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[Aura Design] A "${type}" event listener threw an error.`, error);
      }
    });
  }

  /** Removes every listener. */
  function clear() {
    listeners.clear();
  }

  return { on, once, emit, clear };
}


/* ==========================================================================
   Shared instances for the site
   ========================================================================== */

/**
 * Names of the one-off events. Payloads:
 *
 *   LIGHTBOX_OPEN   { projects: Project[], index: number }
 *                   projects: the projects currently shown (after filtering),
 *                   index: position of the clicked one inside that list.
 *   LIGHTBOX_CLOSE  { index: number }  position of the project that was showing.
 *   FORM_SUBMITTED  { service: string, budget: string }  the chosen values.
 *                   Personal details are deliberately not included.
 */
export const EVENTS = Object.freeze({
  LIGHTBOX_OPEN: 'lightbox:open',
  LIGHTBOX_CLOSE: 'lightbox:close',
  FORM_SUBMITTED: 'form:submitted',
});

/**
 * Shared state for the whole site.
 *
 * selectedServiceId: id of the service the visitor chose in the pricing grid
 *   (matches the ids in data/services.js and the form's <option> values), or
 *   null when nothing is chosen.
 */
export const store = createStore({
  selectedServiceId: null,
});

/** Shared event bus for the whole site. */
export const events = createEmitter();