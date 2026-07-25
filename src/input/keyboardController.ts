import * as THREE from "three";

export interface InputController {
  movement(target: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

type MoveDirection = "up" | "down" | "left" | "right";

const directionCodes: Record<MoveDirection, string> = {
  up: "move-up",
  down: "move-down",
  left: "move-left",
  right: "move-right",
};

export function createInputController(options: {
  root: HTMLElement;
  onAgentShortcut(index: number): void;
  onRecall(): void;
  onWhistle(): void;
  onToggleEvidence(): void;
  onToggleMemory(): void;
  onEscape(): void;
}): InputController {
  const pressed = new Set<string>();
  const touchButtons = [...options.root.querySelectorAll<HTMLButtonElement>("[data-move-direction]")];

  const onKeyDown = (event: KeyboardEvent): void => {
    const movementCode = keyboardMovementCode(event.code);
    if (movementCode) {
      event.preventDefault();
      pressed.add(movementCode);
    }
    if (event.repeat) return;
    if (event.code === "Digit1") options.onAgentShortcut(0);
    if (event.code === "Digit2") options.onAgentShortcut(1);
    if (event.code === "Digit3") options.onAgentShortcut(2);
    if (event.code === "KeyR") options.onRecall();
    if (event.code === "Space") {
      event.preventDefault();
      options.onWhistle();
    }
    const evidenceKey = event.code === "KeyM" || event.key.toLowerCase() === "m";
    if (evidenceKey) {
      event.preventDefault();
      options.onToggleEvidence();
    }
    if (event.code === "Tab") {
      event.preventDefault();
      options.onToggleMemory();
    }
    if (event.code === "Escape") options.onEscape();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    const movementCode = keyboardMovementCode(event.code);
    if (movementCode) pressed.delete(movementCode);
  };
  const onBlur = (): void => pressed.clear();
  const onContextMenu = (event: MouseEvent): void => {
    if (options.root.contains(event.target as Node)) event.preventDefault();
  };

  const touchCleanups = touchButtons.map((button) => {
    const direction = button.dataset.moveDirection as MoveDirection;
    const code = directionCodes[direction];
    const start = (event: PointerEvent): void => {
      event.preventDefault();
      pressed.add(code);
      button.setPointerCapture(event.pointerId);
    };
    const end = (event: PointerEvent): void => {
      pressed.delete(code);
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    return () => {
      button.removeEventListener("pointerdown", start);
      button.removeEventListener("pointerup", end);
      button.removeEventListener("pointercancel", end);
    };
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  options.root.addEventListener("contextmenu", onContextMenu);

  return {
    movement(target) {
      target.set(
        Number(pressed.has("move-right")) - Number(pressed.has("move-left")),
        0,
        Number(pressed.has("move-down")) - Number(pressed.has("move-up")),
      );
      if (target.lengthSq() > 1) target.normalize();
      return target;
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      options.root.removeEventListener("contextmenu", onContextMenu);
      touchCleanups.forEach((cleanup) => cleanup());
    },
  };
}

function keyboardMovementCode(code: string): string | null {
  if (code === "KeyW" || code === "ArrowUp") return "move-up";
  if (code === "KeyS" || code === "ArrowDown") return "move-down";
  if (code === "KeyA" || code === "ArrowLeft") return "move-left";
  if (code === "KeyD" || code === "ArrowRight") return "move-right";
  return null;
}
