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
);
