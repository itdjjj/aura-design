/**
 * Aura Design: layout/footer.js
 *
 * The footer's links, contact details and legal line are static HTML in
 * index.html, so they are readable by search engines and without JavaScript.
 * This module only keeps the copyright year current.
 *
 * Markup it looks for:
 *   <span data-year>2026</span>
 *     Replaced with the current year.
 *   <span data-year data-year-start="2012">2026</span>
 *     Optional. Becomes a range such as "2012-2026" once the current year is
 *     later than the start year.
 */

/**
 * Returns the text to show for one [data-year] element.
 *
 * @param {HTMLElement} element
 * @param {number} currentYear
 * @returns {string}
 */
function formatYear(element, currentYear) {
  const startYear = Number.parseInt(element.dataset.yearStart ?? '', 10);

  if (Number.isInteger(startYear) && startYear > 0 && startYear < currentYear) {
    return `${startYear}–${currentYear}`;
  }

  return String(currentYear);
}

/**
 * Sets the copyright year in every [data-year] element on the page.
 * Safe to call when the page has none.
 */
export function initFooter() {
  const yearElements = document.querySelectorAll('[data-year]');

  if (!yearElements.length) {
    return;
  }

  const currentYear = new Date().getFullYear();

  yearElements.forEach((element) => {
    element.textContent = formatYear(element, currentYear);
  });
}