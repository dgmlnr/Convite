import { describe, expect, it } from "vitest";
import { deriveWsEndpoint } from "./match-flow.js";

describe("deriveWsEndpoint (the Colyseus WS endpoint is the SAME origin as this iframe's own page, apps/server shares one http.Server for both plain HTTP routes and the Colyseus transport)", () => {
  it("maps http: to ws: and keeps the exact host (including a non-default port)", () => {
    expect(deriveWsEndpoint({ protocol: "http:", host: "localhost:2567" })).toBe("ws://localhost:2567");
  });

  it("maps https: to wss: for a real deployed origin with no explicit port", () => {
    expect(deriveWsEndpoint({ protocol: "https:", host: "play.hexdev.example" })).toBe("wss://play.hexdev.example");
  });
});
