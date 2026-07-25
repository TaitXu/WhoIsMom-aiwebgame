export interface DebugPanel {
  dispose(): void;
}

export function createDebugPanel(options: {
  root: HTMLElement;
  onTeleport(checkpoint: string): void;
}): DebugPanel {
  const panel = options.root.querySelector<HTMLElement>("[data-debug-panel]");
  if (!panel || !new URLSearchParams(window.location.search).has("debug")) {
    return { dispose() {} };
  }

  const checkpoints: Array<{ id: string; label: string }> = [
    { id: "spring-grassbank", label: "春草岸" },
    { id: "dragonfly-shoal", label: "蜻蜓滩" },
    { id: "pebble-bend", label: "卵石弯" },
    { id: "turtle-reedbank", label: "乌龟岸" },
    { id: "lotus-causeway", label: "莲叶堤" },
    { id: "crescent-reed-bay", label: "月牙湾" },
  ];
  checkpoints.forEach(({ id, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.checkpoint = id;
    button.textContent = label;
    panel.append(button);
  });
  panel.hidden = false;

  const onClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-checkpoint]");
    if (button) options.onTeleport(button.dataset.checkpoint ?? "hatching-pool");
  };
  panel.addEventListener("click", onClick);

  return {
    dispose() {
      panel.removeEventListener("click", onClick);
      panel.replaceChildren();
    },
  };
}
