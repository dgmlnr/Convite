import type { JSX } from "react";

import { AppShell } from "./AppShell.js";

/**
 * The real root component (task 14.2, replacing the scaffold's own
 * placeholder from task 13b.1 — a `Button` painted with the bridged
 * primary color, no route, no data). `AppShell` is now what decides which
 * screen an operator sees.
 */
export function App(): JSX.Element {
  return <AppShell />;
}
