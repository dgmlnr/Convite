import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // `**/dist/**` alone misses Vite's own output dirs for this project's
    // two non-tsc builds: `dist-app` (apps/widget-app, app-mode) and
    // `dist-iife` (packages/widget-sdk, lib-mode IIFE) — see obs 2940 for
    // why `tsc -b`'s own `dist/` is deliberately a different name. A real,
    // previously-undiscovered gap: `pnpm exec eslint .` run AFTER building
    // both (this unit's own from-clean verification, not assumed) flagged
    // 607 errors in minified/bundled output that was never meant to be
    // linted as source.
    ignores: ["**/dist/**", "**/dist-app/**", "**/dist-iife/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["*.cjs", "*.config.js", "*.config.ts", "**/{scripts,tools}/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Generalized to any `packages/games/*-engine` package (was
    // `truco-engine`-only) — a hand-picked `files` list is exactly the
    // enforcement gap `gotchas/cercados-no-se-heredan-a-juego-nuevo`
    // describes: a game engine born under this glob is fenced from the
    // start, with no per-package edit required. One block, every engine, no
    // drift between copies.
    files: ["packages/games/*-engine/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["node:*"],
          paths: ["fs", "path", "http", "net", "child_process", "os", "crypto", "util"],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "a game engine must be deterministic: pass randomness in as input." },
        { object: "Date", property: "now", message: "a game engine must be deterministic: no wall-clock reads." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "a game engine must be deterministic: no `new Date()`.",
        },
      ],
    },
  },
  {
    files: ["packages/transport-colyseus/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Colyseus's `reserveSeatFor(room, options, authData)` SKIPS `onAuth`
          // entirely when `authData` is non-empty — it assigns `client.auth`
          // directly, with no error and no warning. Verified in the installed
          // @colyseus/core Room.mjs:
          //   if (authData) { client.auth = authData }
          //   else if (this.onAuth !== _Room.prototype.onAuth) { ... onAuth ... }
          //
          // MatchRoom.onAuth is where token verification, origin re-validation,
          // entitlement checking and the replay guard all live. Passing authData
          // would silently disable all four. Reserve with two arguments only and
          // let onAuth stay the sole authority on every live join.
          selector: "CallExpression[callee.property.name='reserveSeatFor'][arguments.length>2]",
          message:
            "reserveSeatFor's third argument (authData) bypasses onAuth entirely, disabling token, origin, entitlement and replay checks. Reserve with two arguments and let onAuth run.",
        },
      ],
    },
  },
);
