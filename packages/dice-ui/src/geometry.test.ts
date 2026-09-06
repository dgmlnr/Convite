import { describe, expect, it } from "vitest";
import {
  DIE_FACES,
  DIE_REST_TILT,
  FACE_PIP_SLOTS,
  FACE_ROTATION,
  PIP_SLOTS,
  CUP_TAP_MIN,
  DIE_SIDE_FACE,
  DIE_SIDE_ORDER,
  restingPoseDeclaration,
} from "./geometry.js";

describe("geometry: the six faces, and nothing pretending to be a seventh", () => {
  it("names exactly the six faces a die has", () => {
    expect([...DIE_FACES].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("gives every face a pip layout, and no face invents a tenth slot", () => {
    for (const face of DIE_FACES) {
      const slots = FACE_PIP_SLOTS[face];
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) expect(slot).toBeGreaterThanOrEqual(0);
      for (const slot of slots) expect(slot).toBeLessThan(PIP_SLOTS.length);
    }
  });

  it("counts one pip per opposite face pair correctly (1↔6, 2↔5, 3↔4 read 1/2/3 pips on the low side)", () => {
    expect(FACE_PIP_SLOTS[1]!.length).toBe(1);
    expect(FACE_PIP_SLOTS[2]!.length).toBe(2);
    expect(FACE_PIP_SLOTS[3]!.length).toBe(3);
    expect(FACE_PIP_SLOTS[4]!.length).toBe(4);
    expect(FACE_PIP_SLOTS[5]!.length).toBe(5);
    expect(FACE_PIP_SLOTS[6]!.length).toBe(6);
  });

  it("centres the one-pip face on the middle slot — index 4 of the 3x3 grid", () => {
    expect(FACE_PIP_SLOTS[1]).toEqual([4]);
  });

  it("never centres the six-pip face — a die's six never uses the middle slot", () => {
    expect(FACE_PIP_SLOTS[6]).not.toContain(4);
  });
});

describe("geometry: the resting-pose table has exactly one entry per face", () => {
  it("has a rotation for every one of the six faces and no others", () => {
    expect(Object.keys(FACE_ROTATION).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("assigns the identity rotation to face 1 — the cube's own front, unrotated", () => {
    expect(FACE_ROTATION[1]).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it("gives opposite faces (1/6, 2/5, 3/4) rotations exactly 180 degrees apart on one shared axis", () => {
    const pairs: [1 | 2 | 3, 6 | 5 | 4][] = [
      [1, 6],
      [2, 5],
      [3, 4],
    ];
    for (const [a, b] of pairs) {
      const ra = FACE_ROTATION[a];
      const rb = FACE_ROTATION[b];
      // Exactly one axis differs between an opposite pair, and by 180
      // degrees — turning a die over is a half-turn on one axis, never a
      // diagonal move touching both.
      const dx = Math.abs(ra.rotateX - rb.rotateX) % 360;
      const dy = Math.abs(ra.rotateY - rb.rotateY) % 360;
      expect([dx, dy].filter((delta) => delta === 180).length).toBe(1);
      expect([dx, dy].filter((delta) => delta === 0).length).toBe(1);
    }
  });
});

describe("geometry: restingPoseDeclaration is a pure string, no rendering needed to check it", () => {
  it("writes both custom properties for every face, each matching FACE_ROTATION exactly", () => {
    for (const face of DIE_FACES) {
      const declaration = restingPoseDeclaration(face);
      const { rotateX, rotateY } = FACE_ROTATION[face];
      expect(declaration).toMatch(new RegExp(`--dice-rest-x:\\s*${String(rotateX)}deg`));
      expect(declaration).toMatch(new RegExp(`--dice-rest-y:\\s*${String(rotateY)}deg`));
    }
  });
});

describe("geometry: DIE_REST_TILT is one constant pair, meant for a static CSS rule, never folded into a per-face pose", () => {
  it("is the same two numbers regardless of which face — no per-face table exists for it", () => {
    expect(typeof DIE_REST_TILT.rotateX).toBe("number");
    expect(typeof DIE_REST_TILT.rotateY).toBe("number");
  });

  it("stays small enough to be cosmetic — well short of the 90 degrees that would compete with a facelet for dominance", () => {
    expect(Math.abs(DIE_REST_TILT.rotateX)).toBeLessThan(45);
    expect(Math.abs(DIE_REST_TILT.rotateY)).toBeLessThan(45);
  });
});

describe("geometry: every named side owns exactly one face, and the roster is complete", () => {
  it("lists all six sides in DIE_SIDE_ORDER, matching DIE_SIDE_FACE's own keys", () => {
    expect([...DIE_SIDE_ORDER].sort()).toEqual(Object.keys(DIE_SIDE_FACE).sort());
  });

  it("assigns each of the six faces to exactly one side — no face is a passenger on two sides, none is left off the cube", () => {
    const assigned = DIE_SIDE_ORDER.map((side) => DIE_SIDE_FACE[side]).sort((a, b) => a - b);
    expect(assigned).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("geometry: the cup's tap target meets the accessibility floor", () => {
  it("is at least the 44px WCAG 2.5.5 minimum", () => {
    expect(CUP_TAP_MIN).toBeGreaterThanOrEqual(44);
  });
});
