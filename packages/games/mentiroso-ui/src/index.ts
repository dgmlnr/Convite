export { createMentirosoTableRenderer } from "./table.js";
export type { MentirosoTableRender } from "./table.js";

/**
 * THE BARREL (SDD `mentiroso`, task 6.1) — this package's own public export
 * surface, `package.json`'s `exports` field pointed here (`./dist/index.js`)
 * since work unit E1 first scaffolded this package, unopened until now
 * because nothing outside `mentiroso-ui` needed it yet. `apps/widget-app`
 * is the first real consumer, and it reaches this package only through
 * this declared surface — never a deep relative import into `src/`, the
 * same boundary every sibling `*-ui` package's own barrel already keeps.
 *
 * ONLY THE COMPOSED TABLE, not `table-layout.ts`/`cups.ts`/`bid-picker.ts`/
 * `showdown.ts` individually: `table.ts`'s own docblock is explicit that it
 * is the one file in this package that COMPOSES the others, and a widget
 * mounts a whole table, never one panel of it standalone. Widening this
 * barrel to the individual pieces is a future consumer's decision, not an
 * assumption made here.
 */
