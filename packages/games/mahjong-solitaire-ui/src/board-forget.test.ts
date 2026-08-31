import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BOARD_SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "board.ts"), "utf8");

/**
 * `forget()` FORGETS EVERYTHING — a SOURCE scan, and the measurement that
 * bought it is a mutation that came back GREEN.
 *
 * `createMahjongBoardRenderer` keeps four mutable fields describing what is
 * on screen: the element map, the surface, the last board, and the element
 * currently wearing the selection mark. `forget()` is the one place that says
 * "I no longer know what is on screen", and it has to clear all four or the
 * sentence is false.
 *
 * DELETING `highlighted = null` FROM IT REDS NOTHING (mutation M9u, measured
 * across the whole repository). It cannot: by the time `forget` runs, the
 * element it is holding has already left the document, so the stale reference
 * changes no pixel and the very next `highlight()` reassigns the field
 * anyway. The consequence is only that a closure claiming to know nothing
 * quietly keeps a detached node — real, and invisible to every behaviour test
 * that could ever be written for it.
 *
 * This is R20's family arriving one step over. That rule is about what code
 * may CONSULT and needs a source scan because a runtime with nothing to
 * consult produces no consequence; this is about what code may REMEMBER, and
 * a reference nothing reads produces no consequence either. Both are claims
 * about the code rather than about its behaviour, so both need a fence that
 * reads the code.
 *
 * GENERAL RATHER THAN A CHECK FOR ONE LINE. The failure this guards is a
 * FUTURE field added to the closure and not reset here — a cached previous
 * selection, a pending animation handle — which is the same defect with a
 * name nobody has written yet. So the scan derives the field list from the
 * source rather than listing it.
 */

/** The body of a `function <name>(...) { ... }` declaration, brace-matched.
 * A regular expression cannot balance braces, and this file's whole point is
 * that a scan has to be honest about what it is reading.
 *
 * The opening brace is the one that ENDS ITS LINE, not the first one after
 * the name: the renderer factory's own parameter list carries a default of
 * `{}`, and taking that as the body returned an empty string and a scan that
 * reported nothing to check. Caught by this file's own R6 guard rather than
 * by reading it, which is what that guard is for. */
function functionBody(source: string, name: string): string {
  const header = source.indexOf(`function ${name}(`);
  if (header === -1) throw new Error(`scan setup: no function named ${name} in board.ts`);
  const open = source.indexOf("{\n", header);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`scan setup: function ${name} in board.ts never closes`);
}

/** The `let` fields declared directly inside the renderer factory. `const`
 * bindings are deliberately out of scope: a `const` cannot be reassigned, so
 * `forget` clears the ones that hold state by other means (`elements.clear()`)
 * and this list is about the ones an assignment is the only way to reset. */
function mutableFieldsOfRenderer(): readonly string[] {
  const factory = functionBody(BOARD_SOURCE, "createMahjongBoardRenderer");
  return [...factory.matchAll(/^ {2}let ([A-Za-z][A-Za-z0-9]*)\b/gm)].map((match) => match[1]!);
}

function fieldsResetBy(source: string): readonly string[] {
  const body = functionBody(source, "forget");
  return [...body.matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*) = /gm)].map((match) => match[1]!);
}

describe("the renderer's own idea of what is on screen is dropped all at once", () => {
  it("finds fields to check in the first place", () => {
    // R6: a scan that matched nothing would report perfect compliance. The
    // count is asserted low-bound rather than exactly, so adding a field is
    // caught by the fence below rather than by this one.
    const fields = mutableFieldsOfRenderer();
    expect(fields.length, "the scan found no mutable state in a renderer that is built entirely out of it").toBeGreaterThanOrEqual(3);
    expect(fields, "the field the zero-red mutation was about").toContain("highlighted");
  });

  it("clears every one of them in forget()", () => {
    expect([...fieldsResetBy(BOARD_SOURCE)].sort()).toEqual([...mutableFieldsOfRenderer()].sort());
  });

  /**
   * R18: a refusal fence is vacuous unless the thing it refuses EXISTS — and
   * slice 8 found R18's own failure mode, a counterexample doctored with a
   * naive `replace` that rewrote a docblock instead of the code. So this
   * doctors the source through the scan's OWN answer, and asserts the
   * doctored text really differs before believing anything about it.
   */
  it("says so when one of them is left behind", () => {
    const dropped = mutableFieldsOfRenderer()[0]!;
    const doctored = BOARD_SOURCE.replace(new RegExp(`^ {4}${dropped} = [^\\n]*\\n`, "m"), "");

    expect(doctored, "the counterexample never landed, so it proves nothing").not.toBe(BOARD_SOURCE);
    expect(fieldsResetBy(doctored)).not.toContain(dropped);
  });
});
