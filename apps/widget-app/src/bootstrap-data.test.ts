import { describe, expect, it } from "vitest";
import { readInlineBootstrap } from "./bootstrap-data.js";

describe("readInlineBootstrap (widget-embed: the mint result arrives inlined in the HTML, not via a second fetch)", () => {
  // DISCOVERED via a real two-origin Playwright run (see apply-progress): a
  // SAME-ORIGIN fetch from inside the iframe back to its own server carries
  // no `Origin` header at all in a real browser, so the server cannot
  // validate tenant origin on that second request. The server now inlines
  // the already-minted result into the HTML response instead — this reads
  // that inlined global rather than making a network call at all.
  it("reads the bootstrap object the server inlined onto window", () => {
    const bootstrap = { token: "t1", playerId: "p1", catalog: [] };

    const result = readInlineBootstrap({ __HEXDEV_BOOTSTRAP__: bootstrap });

    expect(result).toEqual(bootstrap);
  });

  it("returns undefined when the server minted nothing (mint failed — nothing was inlined)", () => {
    const result = readInlineBootstrap({});

    expect(result).toBeUndefined();
  });
});
