import { describe, expect, it, vi } from "vitest";
import { createProtocolMessageListener, postProtocolMessage } from "./safe-post-message.js";
import { PROTOCOL_NAMESPACE, type ProtocolMessage } from "./messages.js";
import { parseTargetOrigin } from "./target-origin.js";

const resizeMessage: ProtocolMessage = {
  ns: PROTOCOL_NAMESPACE,
  v: 1,
  type: "resize",
  payload: { height: 640 },
};

describe("postProtocolMessage", () => {
  it("forwards the message and the parsed origin to the target's own postMessage", () => {
    const target = { postMessage: vi.fn() };
    const origin = parseTargetOrigin("https://widget.hexdev.example");

    postProtocolMessage(target, resizeMessage, origin);

    expect(target.postMessage).toHaveBeenCalledWith(resizeMessage, "https://widget.hexdev.example");
  });
});

describe("createProtocolMessageListener", () => {
  it("invokes the handler with the parsed message when the origin matches exactly", () => {
    const handler = vi.fn();
    const origin = parseTargetOrigin("https://widget.hexdev.example");
    const listener = createProtocolMessageListener(origin, handler);

    listener({ origin: "https://widget.hexdev.example", data: resizeMessage });

    expect(handler).toHaveBeenCalledWith(resizeMessage);
  });

  it("discards a message whose event.origin does not match the expected peer origin", () => {
    const handler = vi.fn();
    const origin = parseTargetOrigin("https://widget.hexdev.example");
    const listener = createProtocolMessageListener(origin, handler);

    listener({ origin: "https://attacker.example", data: resizeMessage });

    expect(handler).not.toHaveBeenCalled();
  });

  it("discards a message with the right origin but a foreign/malformed payload", () => {
    const handler = vi.fn();
    const origin = parseTargetOrigin("https://widget.hexdev.example");
    const listener = createProtocolMessageListener(origin, handler);

    listener({ origin: "https://widget.hexdev.example", data: { unrelated: true } });

    expect(handler).not.toHaveBeenCalled();
  });
});
