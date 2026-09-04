import type { JSX } from "react";

import { Button } from "./components/ui/button.js";

/**
 * The scaffold's own placeholder screen (task 13b.1) — no route, no data,
 * on purpose: the login screen, shell and tenant list are Phase 14 (PR18),
 * a later slice. Exists only so `pnpm --filter @hexdev/admin dev` has
 * something to render — a `Button` painted with the bridged
 * `--gx-color-primary` value, so a developer can confirm by eye (task
 * 13b.10) that it is a real color, never `hsl(#...)`.
 */
export function App(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <Button>Convite — panel de administración</Button>
    </main>
  );
}
