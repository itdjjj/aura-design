/**
 * Aura Design: data/services.js
 *
 * Content for the Services and Investment section. To change a price, a
 * description or a list of inclusions, edit this file; no other code needs to
 * change. Services appear on the page in the order listed here.
 *
 * How it is used:
 *   - services-grid.js renders one card per service, formats the price with
 *     Intl.NumberFormat using servicesCurrency, and lets visitors expand a
 *     card to read its inclusions.
 *   - Choosing a card's "Choose this service" button publishes the service id
 *     through core/store.js, and consultation-form.js pre-selects the matching
 *     option in the form's "Service of interest" menu.
 *
 * Keep in sync with index.html:
 *   - Each service id must match an <option value="..."> in the consultation
 *     form's #service select. The form's extra "not-sure" option is not a
 *     service and does not belong here.
 *   - The <noscript> text in the services section quotes the lowest price
 *     (Design Consultation, from $450). Update it if that price changes.
 *   - The pricing footnote says all prices are starting figures in US dollars.
 *     If servicesCurrency changes, update that sentence as well.
 *
 * The prices and inclusions below are sample content. Replace them with the
 * studio's real offer before launch.
 */

/**
 * @typedef {Object} ServicePrice
 * @property {number} amount  Starting price in whole currency units.
 * @property {string} unit    What the price covers, for example "per project".
 *
 * @typedef {Object} Service
 * @property {string} id            Stable identifier, matches the form select value.
 * @property {string} title         Service name.
 * @property {string} summary       One or two sentences describing the service.
 * @property {ServicePrice} price   Starting price, always shown with a "from" label.
 * @property {readonly string[]} features  What is included, shown when a card expands.
 * @property {string} ctaLabel      Text for the card's call-to-action button.
 * @property {boolean} featured     True for the highlighted (dark) card. Use for one service only.
 * @property {string} [tag]         Optional badge above the title, for example "Most popular".
 */

/** ISO 4217 currency code used to format every price. */
export const servicesCurrency = 'USD';

/**
 * Builds a frozen service record so no module can change the data by accident.
 *
 * @param {Service} service
 * @returns {Readonly<Service>}
 */
function defineService(service) {
  return Object.freeze({
    ...service,
    price: Object.freeze({ ...service.price }),
    features: Object.freeze([...service.features]),
  });
}

/** @type {readonly Readonly<Service>[]} */
export const services = Object.freeze([
  defineService({
    id: 'design-consultation',
    title: 'Design Consultation',
    summary:
      'A focused half-day with a senior designer, in your space or over video. Ideal when you need clear direction, a second opinion or a confident place to start.',
    price: { amount: 450, unit: 'per session' },
    features: [
      'Half-day on-site or virtual session with a senior designer',
      'Review of your floor plans, photographs and ideas',
      'Colour, material and lighting direction for each room',
      'Prioritised action list and suggested order of works',
      'Written summary and mood references within five working days',
    ],
    ctaLabel: 'Choose Consultation',
    featured: false,
  }),

  defineService({
    id: 'concept-design',
    title: 'Concept Design Package',
    summary:
      'A complete design proposal for one or more rooms, ready for you to take to your own contractor or to hand to our team for delivery.',
    price: { amount: 4500, unit: 'per project' },
    features: [
      'Detailed brief and two design workshops',
      'Space planning and furniture layouts',
      'Concept boards with colour palette and material samples',
      'Lighting and joinery concept sketches',
      'Curated furniture and fixture shortlist with budget estimates',
      'Two rounds of revisions',
    ],
    ctaLabel: 'Choose Concept Design',
    featured: false,
  }),

  defineService({
    id: 'full-service',
    title: 'Full-Service Interior Design',
    summary:
      'Our complete service, from first sketch to final styled shelf. We design, source, coordinate trades and oversee installation so you can simply move in.',
    price: { amount: 18000, unit: 'per project' },
    features: [
      'Everything in the Concept Design Package',
      'Technical drawings, specifications and bespoke joinery design',
      'Sourcing and procurement from our trade network',
      'Contractor tendering and trade coordination',
      'Weekly site visits and progress reports',
      'Final installation, styling and a 12-month aftercare review',
    ],
    ctaLabel: 'Choose Full-Service',
    featured: true,
    tag: 'Most popular',
  }),

  defineService({
    id: 'architecture',
    title: 'Architecture & Build Management',
    summary:
      'Architecture and interiors as one continuous process, for new builds, extensions and major renovations. A single team accountable from planning to completion.',
    price: { amount: 35000, unit: 'per project' },
    features: [
      'Feasibility study and site analysis',
      'Architectural design and planning application support',
      'Coordination of structural, mechanical and electrical consultants',
      'Full interior design integrated with the architecture',
      'Cost planning and contractor procurement',
      'Build management through to practical completion',
    ],
    ctaLabel: 'Choose Architecture',
    featured: false,
  }),
]);

/**
 * Finds a service by its id.
 *
 * @param {string} id
 * @returns {Readonly<Service> | undefined}
 */
export function getServiceById(id) {
  return services.find((service) => service.id === id);
}