import * as THREE from "three";
import type { AgentMode } from "../core/types";

export type CharacterView = {
  group: THREE.Group;
  tail: THREE.Object3D;
  selectionRing?: THREE.Mesh;
  interactionRing?: THREE.Mesh;
  setSelected(selected: boolean): void;
  setHighlighted(highlighted: boolean): void;
  setMode(mode: AgentMode): void;
  update(elapsed: number, speed: number): void;
};

export function createCharacterView(options: {
  group: THREE.Group;
  tail: THREE.Object3D;
  body: THREE.Object3D;
  selectionRing?: THREE.Mesh;
  interactionRing?: THREE.Mesh;
  statusMarker?: THREE.Mesh;
  statusMaterials?: Partial<Record<AgentMode, THREE.Material>>;
  tailAmplitude: number;
  tailFrequency: number;
  bobAmplitude: number;
  phase?: number;
}): CharacterView {
  const {
    group,
    tail,
    body,
    selectionRing,
    interactionRing,
    statusMarker,
    statusMaterials,
    tailAmplitude,
    tailFrequency,
    bobAmplitude,
    phase = 0,
  } = options;
  const bodyBaseY = body.position.y;
  const markerBaseY = statusMarker?.position.y ?? 0;

  return {
    group,
    tail,
    selectionRing,
    interactionRing,
    setSelected(selected) {
      if (selectionRing) selectionRing.visible = selected;
    },
    setHighlighted(highlighted) {
      if (interactionRing) interactionRing.visible = highlighted;
    },
    setMode(mode) {
      if (!statusMarker) return;
      const material = statusMaterials?.[mode];
      statusMarker.visible = Boolean(material);
      if (material) statusMarker.material = material;
    },
    update(elapsed, speed) {
      const activity = 0.55 + Math.min(speed / 4, 1.1);
      tail.rotation.y = Math.sin(elapsed * tailFrequency + phase) * tailAmplitude * activity;
      body.position.y = bodyBaseY + Math.sin(elapsed * 2.6 + phase) * bobAmplitude;
      group.rotation.z = THREE.MathUtils.lerp(
        group.rotation.z,
        Math.sin(elapsed * 3 + phase) * 0.025 * activity,
        0.08,
      );
      if (statusMarker?.visible) {
        statusMarker.position.y = markerBaseY + Math.sin(elapsed * 4 + phase) * 0.06;
        statusMarker.rotation.y = elapsed * 1.5;
      }
      if (interactionRing?.visible) {
        const pulse = 1 + Math.sin(elapsed * 4 + phase) * 0.08;
        interactionRing.scale.set(pulse, pulse, pulse);
      }
    },
  };
}
