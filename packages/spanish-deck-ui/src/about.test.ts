import { describe, expect, it } from "vitest";
import { DECK_ATTRIBUTION } from "./about.js";

describe("about: deck attribution text documents provenance for an about screen", () => {
  it("names Heraclio Fournier and the 1878 deck", () => {
    expect(DECK_ATTRIBUTION.body).toContain("Fournier");
    expect(DECK_ATTRIBUTION.body).toContain("1878");
  });

  it("names the Fournier Museum of Playing Cards collection", () => {
    expect(DECK_ATTRIBUTION.body).toMatch(/Fournier Museum of Playing Cards/);
  });

  it("discloses the historical printer's marks kept on the as de oros and the fours (obs 2962)", () => {
    expect(DECK_ATTRIBUTION.body).toContain("Premiada en la Exposición");
    expect(DECK_ATTRIBUTION.body).toContain("Heraclio Fournier, Clase 3");
  });

  it("links to the Wikimedia Commons source category", () => {
    expect(DECK_ATTRIBUTION.sourceUrl).toContain("commons.wikimedia.org");
    expect(DECK_ATTRIBUTION.sourceUrl).toContain("Heraclio_Fournier");
  });

  it("states the public-domain license and that attribution is not legally required", () => {
    expect(DECK_ATTRIBUTION.licenseNote).toMatch(/public domain/i);
    expect(DECK_ATTRIBUTION.licenseNote).toMatch(/not.*legally required/i);
  });

  it("has a non-empty display title for the about-screen section", () => {
    expect(DECK_ATTRIBUTION.title.length).toBeGreaterThan(0);
  });
});
