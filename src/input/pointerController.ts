import * as THREE from "three";

export type InteractiveTarget = {
  type: "agent" | "npc" | "frog" | "obstacle" | "gate";
  id: string;
};

export interface PointerController {
  add(object: THREE.Object3D): void;
  dispose(): void;
}

export function createPointerController(options: {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  onSelect(target: InteractiveTarget): void;
  onMoveTarget(point: THREE.Vector3): void;
}): PointerController {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const riverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const worldPoint = new THREE.Vector3();
  const clickables: THREE.Object3D[] = [];

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

  const onPointerUp = (event: PointerEvent): void => {
    updatePointer(event);
    raycaster.setFromCamera(pointer, options.camera);
    const hit = raycaster.intersectObjects(clickables, true)[0];
    const target = hit ? findTarget(hit.object) : null;
    if (target) {
      options.onSelect(target);
      return;
    }
    if (raycaster.ray.intersectPlane(riverPlane, worldPoint)) options.onMoveTarget(worldPoint);
  };

  const onPointerMove = (event: PointerEvent): void => {
    updatePointer(event);
    raycaster.setFromCamera(pointer, options.camera);
    const hit = raycaster.intersectObjects(clickables, true)[0];
    options.canvas.style.cursor = hit && findTarget(hit.object) ? "pointer" : "crosshair";
  };

  options.canvas.addEventListener("pointerup", onPointerUp);
  options.canvas.addEventListener("pointermove", onPointerMove);

  return {
    add(object) {
      clickables.push(object);
    },
    dispose() {
      options.canvas.removeEventListener("pointerup", onPointerUp);
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.style.cursor = "default";
    },
  };
}
