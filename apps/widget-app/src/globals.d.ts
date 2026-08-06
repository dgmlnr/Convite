export {};

declare global {
  interface Window {
    /** Inlined by `apps/server/src/embed-shell.ts` directly into the HTML
     * response for a successful mint — see `bootstrap-data.ts`'s
     * `readInlineBootstrap` for why this is inlined rather than fetched. */
    __HEXDEV_BOOTSTRAP__?: import("./bootstrap-data.js").BootstrapResult;
  }
}
