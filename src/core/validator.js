/**
 * Aura Design: core/validator.js
 *
 * A small rule-based validation engine. It decides whether a value is valid
 * and which message to show. It never touches the page: showing errors,
 * toggling states and moving focus belong to components/consultation-form.js.
 *
 * Declaring rules in HTML
 *   Put a pipe-separated list in data-rules on the input, select or textarea:
 *     <input data-rules="required|minLength:2">
 *   Rules run in the order written and validation stops at the first failure,
 *   so the visitor sees one clear message at a time. Put "required" first.
 *
 * Built-in rules
 *   required         not empty. A checkbox must be ticked. A select must have
 *                    a value (the empty placeholder option does not count).
 *   email            a plausible email address (see isValidEmail)
 *   phone            7 to 15 digits, optionally starting with + and using
 *                    spaces, dots, dashes and brackets as separators
 *   minLength:N      at least N characters
 *   maxLength:N      at most N characters
 *   checked          a checkbox that must be ticked (for consent boxes)
 *
 *   Except for "required" and "checked", every rule passes an EMPTY value.
 *   That is how optional fields work: the phone field only complains when the
 *   visitor typed something that is not a phone number.
 *
 * Messages, in order of priority
 *   1. A data-msg-<rule> attribute on the element, for example
 *        data-msg-required="Tell us who you are"
 *        data-msg-min-length="Please write at least {param} characters"
 *      Write multi-word rule names in kebab-case (minLength becomes
 *      min-length), because HTML attribute names are not case-sensitive.
 *      "{param}" inside a message is replaced by the rule's number.
 *   2. fieldMessages[field name][rule], below: friendly text for the six
 *      fields of the consultation form.
 *   3. defaultMessages[rule], below: generic fallbacks.
 *   A message can be a string or a function receiving the rule's parameter.
 *
 * Fields without data-rules (the honeypot, the optional budget menu) are
 * never validated.
 *
 * Exports
 *   validateField     result for one input
 *   validateForm      results for every input with data-rules in a form
 *   validateValue     the same engine for a plain value, no DOM needed
 *   parseRules        "required|minLength:2" into [{ name, param }]
 *   registerRule      add a custom rule
 *   getFieldValue     the value a rule sees for an input
 *   fieldMessages, defaultMessages   editable message tables
 */


/* ==========================================================================
   Types
   ========================================================================== */

/**
 * @typedef {Object} ParsedRule
 * @property {string} name
 * @property {number | string | undefined} param  Numbers are converted.
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string} rule     Name of the failed rule, or "" when valid.
 * @property {string} message  Text to show, or "" when valid.
 *
 * @typedef {Object} FieldError
 * @property {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} input
 * @property {string} name     The input's name attribute (falls back to its id).
 * @property {string} rule
 * @property {string} message
 *
 * @typedef {Object} FormValidation
 * @property {boolean} valid
 * @property {FieldError[]} errors        In document order.
 * @property {FieldError['input'] | null} firstInvalid  The input to focus first.
 *
 * @typedef {string | ((param?: number | string) => string)} Message
 */


/* ==========================================================================
   Messages (edit these to change the wording on the page)
   ========================================================================== */

/** @type {Record<string, Message>} Generic fallbacks, used when nothing more specific exists. */
export const defaultMessages = {
  required: 'This field is required.',
  email: 'Please enter a valid email address.',
  phone: 'Please enter a valid phone number.',
  minLength: (count) => `Please enter at least ${count} characters.`,
  maxLength: (count) => `Please keep this to ${count} characters or fewer.`,
  checked: 'Please tick this box to continue.',
};

/**
 * Friendly, field-specific wording for the consultation form. Keys are the
 * inputs' name attributes in index.html.
 *
 * @type {Record<string, Record<string, Message>>}
 */
export const fieldMessages = {
  fullName: {
    required: 'Please tell us your name.',
    minLength: (count) => `Your name looks a little short. Please enter at least ${count} characters.`,
  },
  email: {
    required: 'We need your email address so we can reply.',
    email: 'That email address does not look right. It should look like jane@example.com.',
  },
  phone: {
    phone: 'Please enter a valid phone number, for example +1 212 555 0100, or leave this empty.',
  },
  service: {
    required: 'Please choose the service you are interested in.',
  },
  message: {
    required: 'Please tell us a little about your project.',
    minLength: (count) =>
      `Please share a little more detail, at least ${count} characters, so we can prepare for your call.`,
    maxLength: (count) => `Please keep your message to ${count} characters or fewer.`,
  },
  consent: {
    checked: 'Please confirm that you are happy for us to contact you.',
  },
};


/* ==========================================================================
   Format checks
   ========================================================================== */

/** Letters and digits in any language, plus the symbols the email standard allows. */
const EMAIL_LOCAL_PATTERN = /^[\p{L}\p{N}!#$%&'*+\/=?^_`{|}~.-]+$/u;

/** One part of a domain name: 1 to 63 characters, no leading or trailing hyphen. */
const EMAIL_DOMAIN_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;

/**
 * Checks that a string is a plausible email address. It is deliberately
 * practical rather than exhaustive: the only real test of an address is
 * sending mail to it. It catches typos such as a missing @, a missing dot in
 * the domain, spaces, and doubled dots, and accepts international names.
 *
 * @param {string} value  Already trimmed.
 * @returns {boolean}
 */
function isValidEmail(value) {
  if (value.length > 254) {
    return false;
  }

  const at = value.lastIndexOf('@');

  // Exactly one @, with something before it
  if (at < 1 || value.indexOf('@') !== at) {
    return false;
  }

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);

  if (
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !EMAIL_LOCAL_PATTERN.test(local)
  ) {
    return false;
  }

  const labels = domain.split('.');

  if (labels.length < 2 || !labels.every((label) => EMAIL_DOMAIN_LABEL.test(label))) {
    return false;
  }

  const topLevel = labels[labels.length - 1];

  return topLevel.length >= 2 && !/^\d+$/.test(topLevel);
}

/**
 * Checks that a string looks like a phone number: an optional leading +,
 * then digits separated by spaces, dots, dashes or brackets, with 7 to 15
 * digits in total (15 is the international maximum).
 *
 * @param {string} value  Already trimmed.
 * @returns {boolean}
 */
function isValidPhone(value) {
  if (!/^\+?[\d\s().-]+$/.test(value)) {
    return false;
  }

  const digitCount = value.replace(/\D/g, '').length;

  return digitCount >= 7 && digitCount <= 15;
}


/* ==========================================================================
   Rule registry
   ========================================================================== */

/**
 * A rule's test function.
 *
 * @callback RuleTest
 * @param {string | boolean} value  Trimmed text, or true/false for a checkbox.
 * @param {number | string | undefined} param  The text after ":" in the rule.
 * @param {Element | null} input    The input being validated, when there is one.
 * @returns {boolean} True when the value is valid.
 */

/** @type {Map<string, RuleTest>} */
const ruleTests = new Map();

/** True for a value that counts as "left empty". */
function isEmpty(value) {
  return value === '' || value === null || value === undefined || value === false;
}

/**
 * Adds a rule, or replaces one of the same name. A custom rule can then be
 * used in data-rules like a built-in one. Remember to treat an empty value as
 * valid unless the rule is about presence, so optional fields keep working.
 *
 * @example
 * registerRule('noUrls', (value) => isEmpty(value) || !/https?:\/\//i.test(value), 'Please remove web links.');
 *
 * @param {string} name
 * @param {RuleTest} test
 * @param {Message} [message]  Default wording, stored in defaultMessages.
 */
export function registerRule(name, test, message) {
  if (typeof name !== 'string' || !name || /[|:\s]/.test(name)) {
    throw new TypeError('A rule name must be a non-empty string without spaces, "|" or ":".');
  }

  if (typeof test !== 'function') {
    throw new TypeError(`The rule "${name}" needs a test function.`);
  }

  ruleTests.set(name, test);

  if (message !== undefined) {
    defaultMessages[name] = message;
  }
}

registerRule('required', (value) => !isEmpty(value));

registerRule('email', (value) => isEmpty(value) || isValidEmail(String(value)));

registerRule('phone', (value) => isEmpty(value) || isValidPhone(String(value)));

registerRule('minLength', (value, param) => {
  const limit = Number(param);

  return isEmpty(value) || !Number.isFinite(limit) || String(value).length >= limit;
});

registerRule('maxLength', (value, param) => {
  const limit = Number(param);

  return isEmpty(value) || !Number.isFinite(limit) || String(value).length <= limit;
});

registerRule('checked', (value) => value === true);


/* ==========================================================================
   Parsing
   ========================================================================== */

/** @type {Map<string, ParsedRule[]>} */
const parseCache = new Map();

/**
 * Turns "required|minLength:2" into [{ name: 'required' }, { name: 'minLength', param: 2 }].
 * Numeric parameters become numbers. Results are cached, because the same
 * strings are parsed on every keystroke.
 *
 * @param {string | null | undefined} source
 * @returns {ParsedRule[]}
 */
export function parseRules(source) {
  const key = source ?? '';

  if (parseCache.has(key)) {
    return parseCache.get(key);
  }

  const parsed = key
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(':');

      if (separator === -1) {
        return { name: part, param: undefined };
      }

      const name = part.slice(0, separator).trim();
      const rawParam = part.slice(separator + 1).trim();
      const param = /^-?\d+(?:\.\d+)?$/.test(rawParam) ? Number(rawParam) : rawParam;

      return { name, param };
    });

  parseCache.set(key, parsed);

  return parsed;
}


/* ==========================================================================
   Running rules
   ========================================================================== */

/** Rule names already reported as unknown, so a typo warns once, not per keystroke. */
const warnedUnknown = new Set();

/** @type {ValidationResult} */
const VALID = Object.freeze({ valid: true, rule: '', message: '' });

/**
 * Looks up the text to show for a failed rule. See the file header for the
 * order of priority.
 *
 * @param {string} rule
 * @param {number | string | undefined} param
 * @param {Element | null} input
 * @returns {string}
 */
function resolveMessage(rule, param, input) {
  let message;

  // The null check comes first so validateValue works with no page at all
  if (input && input instanceof HTMLElement) {
    // data-msg-required, data-msg-min-length, ...
    const datasetKey = `msg${rule.charAt(0).toUpperCase()}${rule.slice(1)}`;
    message = input.dataset[datasetKey];
  }

  if (message === undefined && input) {
    const fieldName = input.getAttribute('name') || input.id;
    message = fieldMessages[fieldName]?.[rule];
  }

  if (message === undefined) {
    message = defaultMessages[rule];
  }

  if (message === undefined) {
    return 'Please check this field.';
  }

  const text = typeof message === 'function' ? message(param) : message;

  return String(text).replaceAll('{param}', String(param ?? ''));
}

/**
 * Runs parsed rules against a value and reports the first failure.
 *
 * @param {string | boolean} value
 * @param {ParsedRule[]} rules
 * @param {Element | null} input
 * @returns {ValidationResult}
 */
function runRules(value, rules, input) {
  for (const { name, param } of rules) {
    const test = ruleTests.get(name);

    if (!test) {
      if (!warnedUnknown.has(name)) {
        warnedUnknown.add(name);
        console.warn(`[Aura Design] Unknown validation rule "${name}" was ignored.`);
      }

      continue;
    }

    if (!test(value, param, input)) {
      return { valid: false, rule: name, message: resolveMessage(name, param, input) };
    }
  }

  return VALID;
}


/* ==========================================================================
   Public API
   ========================================================================== */

/**
 * The value the rules see for an input: true or false for a checkbox or
 * radio button, otherwise the text with surrounding spaces removed.
 *
 * @param {Element} input
 * @returns {string | boolean}
 */
export function getFieldValue(input) {
  if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) {
    return input.checked;
  }

  if (
    input instanceof HTMLInputElement ||
    input instanceof HTMLSelectElement ||
    input instanceof HTMLTextAreaElement
  ) {
    return input.value.trim();
  }

  return '';
}

/**
 * Validates a plain value against a rule string, without any page element.
 *
 * @param {string | boolean} value
 * @param {string} rulesSource  For example "required|email".
 * @returns {ValidationResult}
 */
export function validateValue(value, rulesSource) {
  const normalized = typeof value === 'string' ? value.trim() : value;

  return runRules(normalized, parseRules(rulesSource), null);
}

/**
 * Validates one input using its data-rules attribute. An input with no
 * data-rules is always valid.
 *
 * @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} input
 * @returns {ValidationResult}
 */
export function validateField(input) {
  const rules = parseRules(input.dataset.rules);

  if (!rules.length) {
    return VALID;
  }

  return runRules(getFieldValue(input), rules, input);
}

/**
 * Validates every enabled input with data-rules inside a form.
 *
 * @param {HTMLFormElement} form
 * @returns {FormValidation}
 */
export function validateForm(form) {
  /** @type {FieldError[]} */
  const errors = [];

  form.querySelectorAll('[data-rules]').forEach((element) => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      element.disabled
    ) {
      return;
    }

    const result = validateField(element);

    if (!result.valid) {
      errors.push({
        input: element,
        name: element.getAttribute('name') || element.id,
        rule: result.rule,
        message: result.message,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    firstInvalid: errors.length ? errors[0].input : null,
  };
}