/**
 * PostCSS configuration
 *
 * Vite picks this file up automatically and runs every imported CSS file
 * (src/styles/main.css and src/styles/components.css) through these plugins:
 *
 *   1. tailwindcss  - expands @tailwind directives and @apply rules, using
 *                     the design tokens and content paths in tailwind.config.js
 *   2. autoprefixer - adds vendor prefixes based on the "browserslist" field
 *                     in package.json
 *
 * The project is "type": "module", so this file uses ES module syntax.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};