/**
 * Aura Design: data/portfolio.js
 *
 * Content for the portfolio gallery. To add, remove or reorder projects, edit
 * the list below; no other code needs to change. Projects appear on the page
 * in the order listed here.
 *
 * How the gallery uses it:
 *   - portfolio-gallery.js renders one card per project and filters by
 *     category. The filter buttons in index.html use the same category ids
 *     (all, residential, commercial, landscape), so keep the ids in sync.
 *   - lightbox.js shows the project's image, title and "category, location,
 *     year" line in the full-screen viewer.
 *
 * Images live in public/images/portfolio/ and are referenced from the site
 * root (Vite serves public/ at "/"). Use portrait photographs of about
 * 1200 x 1500 px (4:5), JPEG or WebP, under roughly 300 KB each. The cards
 * crop to 4:5, so keep the subject centred.
 *
 * The projects below are sample content. Replace titles, locations, years and
 * images with the studio's real work before launch.
 */

/**
 * @typedef {'residential' | 'commercial' | 'landscape'} ProjectCategory
 *
 * @typedef {Object} ProjectImage
 * @property {string} src     Path from the site root.
 * @property {number} width   Intrinsic width in pixels.
 * @property {number} height  Intrinsic height in pixels.
 * @property {string} alt     Describes what the photograph shows, for screen readers.
 *
 * @typedef {Object} Project
 * @property {string} id               Stable identifier, also used as the image file name.
 * @property {string} title            Project name.
 * @property {ProjectCategory} category
 * @property {string} location         City and country or state.
 * @property {number} year             Year of completion.
 * @property {ProjectImage} image
 */

/**
 * Filter options, in the order the buttons appear in index.html.
 * "all" is a filter only and is never assigned to a project.
 */
export const portfolioCategories = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  Object.freeze({ id: 'residential', label: 'Residential' }),
  Object.freeze({ id: 'commercial', label: 'Commercial' }),
  Object.freeze({ id: 'landscape', label: 'Landscape' }),
]);

/**
 * Builds a frozen project record so no module can change the data by accident.
 *
 * @param {Project} project
 * @returns {Readonly<Project>}
 */
function defineProject(project) {
  return Object.freeze({
    ...project,
    image: Object.freeze({ ...project.image }),
  });
}

/** @type {readonly Readonly<Project>[]} */
export const portfolioProjects = Object.freeze([
  // ---------------------------------------------------------------------
  // Residential
  // ---------------------------------------------------------------------
  defineProject({
    id: 'linden-house',
    title: 'Linden House',
    category: 'residential',
    location: 'Hudson Valley, New York',
    year: 2025,
    image: {
      src: '/images/portfolio/linden-house.jpg',
      width: 1200,
      height: 1500,
      alt: 'Open-plan living room in a country house with a limestone fireplace, linen sofas and tall windows onto an orchard',
    },
  }),
  defineProject({
    id: 'mercer-loft',
    title: 'Mercer Loft',
    category: 'residential',
    location: 'New York, New York',
    year: 2025,
    image: {
      src: '/images/portfolio/mercer-loft.jpg',
      width: 1200,
      height: 1500,
      alt: 'Industrial loft apartment with exposed brick, a walnut kitchen island and a sculptural brass pendant light',
    },
  }),
  defineProject({
    id: 'casa-alba',
    title: 'Casa Alba',
    category: 'residential',
    location: 'Mallorca, Spain',
    year: 2024,
    image: {
      src: '/images/portfolio/casa-alba.jpg',
      width: 1200,
      height: 1500,
      alt: 'Whitewashed Mediterranean bedroom with a lime-plaster headboard wall, rattan furniture and sheer curtains',
    },
  }),
  defineProject({
    id: 'harbor-residence',
    title: 'Harbor Residence',
    category: 'residential',
    location: 'Portland, Maine',
    year: 2023,
    image: {
      src: '/images/portfolio/harbor-residence.jpg',
      width: 1200,
      height: 1500,
      alt: 'Coastal home dining room with a long oak table, linen-upholstered chairs and a view across the water',
    },
  }),

  // ---------------------------------------------------------------------
  // Commercial
  // ---------------------------------------------------------------------
  defineProject({
    id: 'atrium-hotel',
    title: 'Atrium Hotel Lobby',
    category: 'commercial',
    location: 'Lisbon, Portugal',
    year: 2025,
    image: {
      src: '/images/portfolio/atrium-hotel.jpg',
      width: 1200,
      height: 1500,
      alt: 'Boutique hotel lobby with a curved reception desk in travertine, deep green velvet seating and a double-height ceiling',
    },
  }),
  defineProject({
    id: 'north-studio-offices',
    title: 'North Studio Offices',
    category: 'commercial',
    location: 'Copenhagen, Denmark',
    year: 2024,
    image: {
      src: '/images/portfolio/north-studio-offices.jpg',
      width: 1200,
      height: 1500,
      alt: 'Creative agency workspace with pale oak desks, acoustic felt partitions and daylight from a sawtooth roof',
    },
  }),
  defineProject({
    id: 'ember-restaurant',
    title: 'Ember Restaurant',
    category: 'commercial',
    location: 'London, United Kingdom',
    year: 2024,
    image: {
      src: '/images/portfolio/ember-restaurant.jpg',
      width: 1200,
      height: 1500,
      alt: 'Intimate restaurant interior with an open kitchen, burnished copper details and warm low lighting over banquette seating',
    },
  }),
  defineProject({
    id: 'sable-boutique',
    title: 'Sable Boutique',
    category: 'commercial',
    location: 'Milan, Italy',
    year: 2023,
    image: {
      src: '/images/portfolio/sable-boutique.jpg',
      width: 1200,
      height: 1500,
      alt: 'Minimal fashion boutique with plaster walls, sculpted stone display plinths and a single oak clothing rail',
    },
  }),

  // ---------------------------------------------------------------------
  // Landscape
  // ---------------------------------------------------------------------
  defineProject({
    id: 'orchard-terrace',
    title: 'Orchard Terrace',
    category: 'landscape',
    location: 'Hudson Valley, New York',
    year: 2025,
    image: {
      src: '/images/portfolio/orchard-terrace.jpg',
      width: 1200,
      height: 1500,
      alt: 'Stone terrace stepping down to an apple orchard, with long wooden benches and drifts of ornamental grasses',
    },
  }),
  defineProject({
    id: 'courtyard-garden',
    title: 'Courtyard Garden',
    category: 'landscape',
    location: 'Brooklyn, New York',
    year: 2024,
    image: {
      src: '/images/portfolio/courtyard-garden.jpg',
      width: 1200,
      height: 1500,
      alt: 'Private urban courtyard with a reflecting pool, clipped hornbeam hedges and dappled shade from a single magnolia',
    },
  }),
  defineProject({
    id: 'dune-pavilion',
    title: 'Dune Pavilion',
    category: 'landscape',
    location: 'Cape Cod, Massachusetts',
    year: 2024,
    image: {
      src: '/images/portfolio/dune-pavilion.jpg',
      width: 1200,
      height: 1500,
      alt: 'Timber garden pavilion set among coastal dune grasses, with a boardwalk leading toward the sea',
    },
  }),
  defineProject({
    id: 'rooftop-meadow',
    title: 'Rooftop Meadow',
    category: 'landscape',
    location: 'Chicago, Illinois',
    year: 2023,
    image: {
      src: '/images/portfolio/rooftop-meadow.jpg',
      width: 1200,
      height: 1500,
      alt: 'Rooftop garden planted as a naturalistic meadow, with weathered steel planters and seating overlooking the city skyline',
    },
  }),
]);

/**
 * Returns the projects for a filter id, keeping their order.
 * "all" (or any unknown id) returns every project.
 *
 * @param {string} categoryId
 * @returns {readonly Readonly<Project>[]}
 */
export function getProjectsByCategory(categoryId) {
  if (categoryId === 'all') {
    return portfolioProjects;
  }

  const matches = portfolioProjects.filter((project) => project.category === categoryId);

  return matches.length || isKnownCategory(categoryId) ? matches : portfolioProjects;
}

/**
 * @param {string} categoryId
 * @returns {boolean} True for a real filter id, including "all".
 */
export function isKnownCategory(categoryId) {
  return portfolioCategories.some((category) => category.id === categoryId);
}

/**
 * Display name for a category id, for example "residential" becomes
 * "Residential". Falls back to the id itself for unknown values.
 *
 * @param {string} categoryId
 * @returns {string}
 */
export function getCategoryLabel(categoryId) {
  return portfolioCategories.find((category) => category.id === categoryId)?.label ?? categoryId;
}