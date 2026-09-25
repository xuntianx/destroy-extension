// Development-only failed child. Never included in the extension build.
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.data?.type !== "DESTROY_UI_INIT" ||
    event.ports.length !== 1
  )
    return;
  const port = event.ports[0],
    channel = event.data.channel;
  port.onmessage = ({ data }) => {
    if (data.type === "state" && data.channel === channel)
      document.querySelector("#state")!.textContent =
        `故障注入：${data.state.phase}；界面故意不回应心跳。`;
  };
  port.start();
  port.postMessage({ type: "ready", channel });
});
