import { describe, expect, it } from "vitest";
import {
  isProtocolMessage,
  negotiateProtocolVersion,
  PROTOCOL_NAMESPACE,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ProtocolMessage,
} from "./messages.js";

describe("isProtocolMessage", () => {
  it("accepts a well-formed ready message", () => {
    const candidate: unknown = {
      ns: PROTOCOL_NAMESPACE,
      v: 1,
      type: "ready",
      payload: { protocolVersions: [1] },
    };

    expect(isProtocolMessage(candidate)).toBe(true);
  });

  it("accepts a well-formed resize message with a numeric height", () => {
    const candidate: unknown = {
      ns: PROTOCOL_NAMESPACE,
      v: 1,
      type: "resize",
      payload: { height: 480 },
    };

    expect(isProtocolMessage(candidate)).toBe(true);
  });

  it("rejects a message from a foreign namespace (another widget on the page)", () => {
    const candidate: unknown = {
      ns: "some-other-widget",
      v: 1,
      type: "ready",
      payload: { protocolVersions: [1] },
    };

    expect(isProtocolMessage(candidate)).toBe(false);
  });

  it("rejects a resize payload whose height is not a number", () => {
    const candidate: unknown = {
      ns: PROTOCOL_NAMESPACE,
      v: 1,
      type: "resize",
      payload: { height: "480px" },
    };

    expect(isProtocolMessage(candidate)).toBe(false);
  });

  it("rejects an unknown message type", () => {
    const candidate: unknown = {
      ns: PROTOCOL_NAMESPACE,
      v: 1,
      type: "eval",
      payload: {},
    };

    expect(isProtocolMessage(candidate)).toBe(false);
  });

  it("rejects a non-object value", () => {
    expect(isProtocolMessage("not an object")).toBe(false);
    expect(isProtocolMessage(null)).toBe(false);
    expect(isProtocolMessage(undefined)).toBe(false);
  });
});

describe("negotiateProtocolVersion", () => {
  it("picks the highest version present in both the iframe's and loader's supported sets", () => {
    const chosen = negotiateProtocolVersion([1, 2], [1, 2, 3]);

    expect(chosen).toBe(2);
  });

  it("returns null when there is no overlap at all", () => {
    const chosen = negotiateProtocolVersion([5, 6], SUPPORTED_PROTOCOL_VERSIONS);

    expect(chosen).toBeNull();
  });

  it("defaults the loader's own supported set to SUPPORTED_PROTOCOL_VERSIONS", () => {
    const chosen = negotiateProtocolVersion([...SUPPORTED_PROTOCOL_VERSIONS]);

    expect(chosen).toBe(Math.max(...SUPPORTED_PROTOCOL_VERSIONS));
  });
});

// Exercise the discriminated union shape itself so a future payload edit
// that breaks a variant fails to compile, not just fails at runtime.
const _typeCheck: ProtocolMessage = {
  ns: PROTOCOL_NAMESPACE,
  v: 1,
  type: "ready",
  payload: { protocolVersions: [1] },
};
void _typeCheck;
