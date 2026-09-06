import { describe, expect, it } from "vitest";
import { DIE_SIDE_FACE, DIE_SIDE_LOCAL_TRANSFORM, DIE_SIDE_ORDER, FACE_ROTATION } from "./geometry.js";

/**
 * PROVES `FACE_ROTATION` IS DERIVED, NOT TYPED BY HAND TWICE.
 *
 * `geometry.ts`'s own comment states the relationship in words: a facelet's
 * outward normal points at the viewer once the cube's own rotation `R`
 * undoes that facelet's fixed local rotation `Rf`, i.e. `R = Rf⁻¹`. This test
 * checks the ARITHMETIC rather than trusting the comment: it parses the
 * rotation back out of each side's own `DIE_SIDE_LOCAL_TRANSFORM` string,
 * negates it, and asserts the result equals `FACE_ROTATION`'s entry for the
 * face that side carries (`DIE_SIDE_FACE`).
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. Without this fence, a future edit to
 * `DIE_SIDE_LOCAL_TRANSFORM` (say, reassigning which side carries which
 * face, or changing a rotation axis while re-shaping the cube) could leave
 * `FACE_ROTATION` silently stale — every OTHER test in this package reads
 * `FACE_ROTATION` as ground truth and would stay green while the cube it is
 * supposed to pose quietly drifted out from under it. This is the one test
 * that checks the table against the geometry it claims to describe, not
 * against itself.
 */
function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function extractRotation(transform: string): { rotateX: number; rotateY: number } {
  const x = /rotateX\((-?\d+)deg\)/.exec(transform);
  const y = /rotateY\((-?\d+)deg\)/.exec(transform);
  return { rotateX: x ? Number(x[1]) : 0, rotateY: y ? Number(y[1]) : 0 };
}

describe("die-rotation-consistency: the resting pose undoes the facelet's own fixed placement", () => {
  it.each(DIE_SIDE_ORDER)("side %s: FACE_ROTATION[its face] is the inverse of its own local transform", (side) => {
    const local = extractRotation(DIE_SIDE_LOCAL_TRANSFORM[side]);
    const rest = FACE_ROTATION[DIE_SIDE_FACE[side]];
    expect(normalizeDeg(rest.rotateX)).toBe(normalizeDeg(-local.rotateX));
    expect(normalizeDeg(rest.rotateY)).toBe(normalizeDeg(-local.rotateY));
  });
});
