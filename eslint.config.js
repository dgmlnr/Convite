import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["*.cjs", "*.config.js", "*.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["packages/games/truco-engine/src/**/*.ts"],
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
        { object: "Math", property: "random", message: "truco-engine must be deterministic: pass randomness in as input." },
        { object: "Date", property: "now", message: "truco-engine must be deterministic: no wall-clock reads." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "truco-engine must be deterministic: no `new Date()`.",
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
