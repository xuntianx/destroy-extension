/** Stop overlay input reaching the host page's bubbling shortcuts and delegated handlers.
 * Native defaults and handlers inside the overlay still run. Host capture listeners that
 * have already run cannot be undone; this is event containment, not an origin boundary.
 */
export function containOverlayInput(root: ShadowRoot, signal: AbortSignal) {
  for (const type of [
    "keydown",
    "keyup",
    "keypress",
    "beforeinput",
    "input",
    "change",
    "compositionstart",
    "compositionupdate",
    "compositionend",
    "click",
    "dblclick",
    "auxclick",
    "contextmenu",
    "pointerdown",
    "pointerup",
    "pointermove",
    "pointercancel",
    "mousedown",
    "mouseup",
    "mousemove",
    "touchstart",
    "touchmove",
    "touchend",
    "wheel",
    "dragstart",
    "dragend",
    "drop",
    "selectstart",
    "copy",
    "cut",
    "paste",
    "focusin",
    "focusout",
    "submit",
  ]) {
    root.addEventListener(type, (event) => event.stopPropagation(), { signal });
  }
}
