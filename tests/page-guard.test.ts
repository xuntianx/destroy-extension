import { describe, expect, it } from "vitest";
import { pageExitReason } from "../src/content/page-guard";
const page = {
  initialUrl: "https://mail.google.com/mail/u/0/#inbox",
  currentUrl: "https://mail.google.com/mail/u/0/#inbox",
  hostConnected: true,
  frameConnected: true,
  scrollerConnected: true,
};
describe("SPA session safety", () => {
  it("does not stop for ordinary content mutations on the same route", () => {
    expect(pageExitReason(page)).toBeUndefined();
  });
  it("treats a Gmail hash navigation as a normal cleanup, even if the old scroller is removed", () => {
    expect(
      pageExitReason({
        ...page,
        currentUrl: "https://mail.google.com/mail/u/0/#sent",
        scrollerConnected: false,
      }),
    ).toEqual({ reason: "Navigation: page route changed", expected: true });
  });
  it("also protects against path and search navigation", () => {
    for (const currentUrl of [
      "https://mail.google.com/mail/u/1/#inbox",
      "https://mail.google.com/mail/u/0/?search=test#inbox",
    ])
      expect(pageExitReason({ ...page, currentUrl })?.expected).toBe(true);
  });
  it("keeps removed UI failures visible and distinguishes container rerenders", () => {
    expect(pageExitReason({ ...page, frameConnected: false })).toEqual({
      reason: "Answer frame removed by the page",
      expected: false,
    });
    expect(pageExitReason({ ...page, hostConnected: false })?.expected).toBe(
      false,
    );
    expect(pageExitReason({ ...page, scrollerConnected: false })?.reason).toBe(
      "Page scroll container replaced",
    );
  });
});
