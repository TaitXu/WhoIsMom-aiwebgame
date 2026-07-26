import * as THREE from "three";

export type InteractiveTarget = {
  type: "agent" | "npc" | "frog" | "obstacle" | "gate";
  id: string;
};

export interface PointerController {
  add(object: THREE.Object3D): void;
  dispose(): void;
}

export type SelectionRect = Readonly<{ left: number; top: number; width: number; height: number }>;

export function createPointerController(options: {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  onSelect(target: InteractiveTarget): void;
  onSelectAgents(agentIds: string[]): void;
  onHoverTarget(target: InteractiveTarget | null): void;
  onBoxSelect(rect: SelectionRect | null): void;
  onMoveTarget(point: THREE.Vector3): void;
}): PointerController {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const riverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const worldPoint = new THREE.Vector3();
  const projectedPoint = new THREE.Vector3();
  const clickables: THREE.Object3D[] = [];
  let boxStart: { x: number; y: number; pointerId: number } | null = null;

  function updatePointer(event: PointerEvent): void {
    const rect = options.canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function findTarget(object: THREE.Object3D): InteractiveTarget | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      const type = current.userData.entityType as string | undefined;
      const id = current.userData.entityId as string | undefined;
      if ((type === "agent" || type === "npc" || type === "frog" || type === "obstacle" || type === "gate") && id) return { type, id };
      current = current.parent;
    }
    return null;
  }

  function findScreenTarget(event: PointerEvent): InteractiveTarget | null {
    const rect = options.canvas.getBoundingClientRect();
    let nearestTarget: InteractiveTarget | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    clickables.forEach((object) => {
      if (!isWorldVisible(object)) return;
      const target = findTarget(object);
      if (target?.type !== "npc" && target?.type !== "obstacle") return;
      object.getWorldPosition(projectedPoint);
      projectedPoint.y += target.type === "npc" ? 0.55 : 0.7;
      projectedPoint.project(options.camera);
      if (
        projectedPoint.z < -1 || projectedPoint.z > 1 ||
        projectedPoint.x < -1 || projectedPoint.x > 1 ||
        projectedPoint.y < -1 || projectedPoint.y > 1
      ) return;
      const screenX = rect.left + ((projectedPoint.x + 1) / 2) * rect.width;
      const screenY = rect.top + ((1 - projectedPoint.y) / 2) * rect.height;
      const distanceSq = (event.clientX - screenX) ** 2 + (event.clientY - screenY) ** 2;
      const hitRadius = target.type === "npc" ? 36 : 44;
      if (distanceSq > hitRadius ** 2 || distanceSq > nearestDistanceSq) return;
      nearestDistanceSq = distanceSq;
      nearestTarget = target;
    });
    return nearestTarget;
  }

  function isWorldVisible(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }

  function targetAtPointer(event: PointerEvent): InteractiveTarget | null {
    raycaster.setFromCamera(pointer, options.camera);
    const hit = raycaster.intersectObjects(clickables.filter(isWorldVisible), true)[0];
    return (hit ? findTarget(hit.object) : null) ?? findScreenTarget(event);
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2 && boxStart) {
      const rect = options.canvas.getBoundingClientRect();
      const endX = event.clientX - rect.left;
      const endY = event.clientY - rect.top;
      const left = Math.min(boxStart.x, endX);
      const top = Math.min(boxStart.y, endY);
      const width = Math.abs(endX - boxStart.x);
      const height = Math.abs(endY - boxStart.y);
      if (width > 8 || height > 8) {
        const projected = new THREE.Vector3();
        const selected = clickables.flatMap((object) => {
          const target = findTarget(object);
          if (target?.type !== "agent") return [];
          object.getWorldPosition(projected);
          projected.project(options.camera);
          const x = ((projected.x + 1) / 2) * rect.width;
          const y = ((1 - projected.y) / 2) * rect.height;
          return projected.z >= -1 && projected.z <= 1 && x >= left && x <= left + width && y >= top && y <= top + height ? [target.id] : [];
        });
        options.onSelectAgents([...new Set(selected)]);
      }
      options.onBoxSelect(null);
      if (options.canvas.hasPointerCapture(event.pointerId)) options.canvas.releasePointerCapture(event.pointerId);
      boxStart = null;
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    updatePointer(event);
    const target = targetAtPointer(event);
    if (target) {
      options.onSelect(target);
      return;
    }
    if (raycaster.ray.intersectPlane(riverPlane, worldPoint)) options.onMoveTarget(worldPoint);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (boxStart) {
      const rect = options.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      options.onBoxSelect({
        left: Math.min(boxStart.x, x),
        top: Math.min(boxStart.y, y),
        width: Math.abs(x - boxStart.x),
        height: Math.abs(y - boxStart.y),
      });
      return;
    }
    updatePointer(event);
    const target = targetAtPointer(event);
    options.onHoverTarget(target);
    options.canvas.style.cursor = target ? "pointer" : "crosshair";
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    const rect = options.canvas.getBoundingClientRect();
    boxStart = { x: event.clientX - rect.left, y: event.clientY - rect.top, pointerId: event.pointerId };
    options.canvas.setPointerCapture(event.pointerId);
    options.onBoxSelect({ left: boxStart.x, top: boxStart.y, width: 0, height: 0 });
    event.preventDefault();
  };

  const onContextMenu = (event: MouseEvent): void => event.preventDefault();

  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointerup", onPointerUp);
  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("contextmenu", onContextMenu);

  return {
    add(object) {
      clickables.push(object);
    },
    dispose() {
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("pointerup", onPointerUp);
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("contextmenu", onContextMenu);
      options.onBoxSelect(null);
      options.canvas.style.cursor = "default";
    },
  };
}
