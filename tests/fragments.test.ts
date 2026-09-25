import { describe, it, expect } from "vitest";
import { lineRegions, pseudoText } from "../src/content/fragments";
describe("visual line masks", () => {
  it("keeps mixed-size inline runs and superscripts on the same line", () => {
    const rows = lineRegions(
      [
        { left: 0, top: 4, width: 70, height: 22 },
        { left: 72, top: 0, width: 10, height: 12 },
        { left: 85, top: 5, width: 110, height: 20 },
        { left: 0, top: 36, width: 200, height: 22 },
      ],
      220,
      70,
    );
    expect(rows).toEqual([
      { left: 0, top: 0, width: 220, height: 31 },
      { left: 0, top: 31, width: 220, height: 39 },
    ]);
  });
  it("merges bidi fragments geometrically without depending on DOM order", () => {
    const rows = lineRegions(
      [
        { left: 140, top: 20, width: 70, height: 20 },
        { left: 0, top: 20, width: 130, height: 20 },
        { left: 20, top: 52, width: 170, height: 20 },
      ],
      220,
      90,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].height).toBe(46);
  });
  it("bounds cloning while covering the complete original box without overlaps or gaps", () => {
    const rows = lineRegions(
      Array.from({ length: 40 }, (_, i) => ({
        left: 0,
        top: 6 + i * 28,
        width: 100,
        height: 20,
      })),
      180,
      1130,
      8,
    );
    expect(rows).toHaveLength(8);
    expect(rows[0].top).toBe(0);
    expect(rows.reduce((sum, r) => sum + r.height, 0)).toBe(1130);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i].top).toBe(rows[i - 1].top + rows[i - 1].height);
  });
  it("never invents generated text from a CSS counter, URL or keyword", () => {
    expect(pseudoText('"“"')).toBe("“");
    expect(pseudoText('"\\201D "')).toBe("”");
    for (const s of [
      "none",
      "normal",
      "open-quote",
      "counter(step)",
      'url("x.png")',
    ])
      expect(pseudoText(s)).toBe("");
  });
});
