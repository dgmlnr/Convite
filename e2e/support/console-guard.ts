import type { ConsoleMessage, Page } from "playwright";

export interface ConsoleGuard {
  readonly errors: readonly string[];
}

/**
 * Fails loud on a real browser console/page error instead of only checking
 * the one outcome each spec asserts on — the same "zero console errors" bar
 * every manual live verification in this project's history has held itself
 * to (see apply-progress). A page that "looks" correct but is quietly
 * throwing is exactly the kind of bug a screenshot alone would miss.
 */
export function attachConsoleGuard(page: Page): ConsoleGuard {
  const errors: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error: Error) => {
    errors.push(error.message);
  });
  return { errors };
}
