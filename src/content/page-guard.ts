export function pageExitReason(state: {
  initialUrl: string;
  currentUrl: string;
  hostConnected: boolean;
  frameConnected: boolean;
  scrollerConnected: boolean;
}): { reason: string; expected: boolean } | undefined {
  // SPA navigation (including Gmail hash routes) intentionally ends the
  // session. Restore first; don't report normal navigation as an extension error.
  if (state.currentUrl !== state.initialUrl)
    return { reason: "Navigation: page route changed", expected: true };
  if (!state.hostConnected)
    return { reason: "Overlay host removed by the page", expected: false };
  if (!state.frameConnected)
    return { reason: "Answer frame removed by the page", expected: false };
  if (!state.scrollerConnected)
    return { reason: "Page scroll container replaced", expected: true };
}
