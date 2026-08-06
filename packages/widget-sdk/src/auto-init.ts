import { bootstrap } from "./bootstrap.js";

/**
 * The ONLY module this package's Vite lib-mode IIFE build entry-points on
 * (see `vite.config.ts`). `bootstrap.ts` itself stays free of top-level side
 * effects — `bootstrap.browser.test.ts` calls it directly and asserts on its
 * return value/no-throw behavior. Auto-running on load is exactly what a
 * classic `<script>` tag needs and exactly what a library consumer of
 * `bootstrap()` as a named export would NOT want, so the two concerns are
 * two files, not one.
 */
bootstrap();
