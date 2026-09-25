import { validAnswer } from "../../src/shared/core";
const input = document.querySelector("textarea")!,
  submit = document.querySelector("button")!;
const parentOrigin = new URLSearchParams(location.search).get("parent");
const channel = location.hash.slice(1);
input.focus();
let composing = false;
input.addEventListener("compositionstart", () => {
  composing = true;
});
input.addEventListener("compositionend", () => {
  composing = false;
  submit.disabled = !validAnswer(input.value);
});
input.addEventListener("input", () => {
  submit.disabled = !validAnswer(input.value);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") event.preventDefault();
  if (event.key === "Tab") {
    event.preventDefault();
    const fields = [input, submit].filter((field) => !field.disabled);
    const current = fields.findIndex(
      (field) => field === document.activeElement,
    );
    fields[
      (current + (event.shiftKey ? -1 : 1) + fields.length) % fields.length
    ].focus();
  }
});
document.querySelector("form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  if (composing || !validAnswer(input.value) || !parentOrigin || !channel)
    return;
  input.value = "";
  submit.disabled = true;
  document.querySelector("output")!.textContent = "已回答";
  parent.postMessage({ kind: "answered", channel }, parentOrigin);
});
