import type { NpcId } from "../core/types";

export interface DebugPanel {
  dispose(): void;
}

export function createDebugPanel(options: {
  root: HTMLElement;
  onTeleport(checkpoint: NpcId | "pond"): void;
}): DebugPanel {
  const panel = options.root.querySelector<HTMLElement>("[data-debug-panel]");
  if (!panel || !new URLSearchParams(window.location.search).has("debug")) {
    return { dispose() {} };
  }

  const checkpoints: Array<{ id: NpcId | "pond"; label: string }> = [
    { id: "dragonfly", label: "到蜻蜓" },
    { id: "turtle", label: "到乌龟" },
    { id: "crab", label: "到河蟹" },
    { id: "pond", label: "到荷塘" },
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
    if (button) options.onTeleport(button.dataset.checkpoint as NpcId | "pond");
  };
  panel.addEventListener("click", onClick);

  return {
    dispose() {
      panel.removeEventListener("click", onClick);
      panel.replaceChildren();
    },
  };
}
