/**
 * Injected by `vite.config.ts`'s `define` at IIFE build time (`pnpm --filter
 * @hexdev/widget-sdk run build`), so a deployment can point the built
 * `loader.js` at its real widget origin without hand-editing `bootstrap.ts`
 * per environment. A `typeof` guard against this identifier is always safe
 * even when nothing ever defines it — the tsc project build, Vitest (which
 * uses the ROOT `vitest.config.ts`, not this package's own `vite.config.ts`,
 * so this define never applies there), and a consumer importing the built
 * `dist/` under plain Node all fall back to `bootstrap.ts`'s own default.
 */
declare const __HEXDEV_WIDGET_ORIGIN__: string | undefined;
