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
  update(elapsed: number, speed: number, delta?: number): void;
};

export function createCharacterView(options: {
  group: THREE.Group;
  motionRoot: THREE.Group;
  tail: THREE.Object3D;
  body?: THREE.Object3D;
  selectionRing?: THREE.Mesh;
  interactionRing?: THREE.Mesh;
  statusMarker?: THREE.Mesh;
  statusMaterials?: Partial<Record<AgentMode, THREE.Material>>;
  tailAmplitude: number;
  tailFrequency: number;
  bobAmplitude: number;
  phase?: number;
}): CharacterView {
  const { group, motionRoot, tail, selectionRing, interactionRing, statusMarker, statusMaterials, tailAmplitude, tailFrequency, bobAmplitude, phase = 0 } = options;
  const markerBaseY = statusMarker?.position.y ?? 0;
  let mode: AgentMode = "following";
  let activity = 0;
  let lift = 0;
  let squash = 0;

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
    setMode(nextMode) {
      mode = nextMode;
      if (!statusMarker) return;
      const material = statusMaterials?.[nextMode];
      statusMarker.visible = Boolean(material);
      if (material) statusMarker.material = material;
    },
    update(elapsed, speed, delta = 1 / 60) {
      const targetActivity = THREE.MathUtils.clamp(speed / 4, 0, 1);
      activity = THREE.MathUtils.damp(activity, targetActivity, 8, delta);
      const working = mode === "working" ? 1 : 0;
      const jumping = mode === "jumping" ? 1 : 0;
      const tired = mode === "tired" ? 1 : 0;
      const targetLift = jumping ? Math.abs(Math.sin(elapsed * 5 + phase)) * 0.42 : 0;
      const targetSquash = working ? Math.sin(elapsed * 7 + phase) * 0.06 : jumping ? Math.sin(elapsed * 5 + phase) * 0.1 : 0;
      lift = THREE.MathUtils.damp(lift, targetLift, 10, delta);
      squash = THREE.MathUtils.damp(squash, targetSquash, 9, delta);
      const motionScale = tired ? 0.42 : 0.65 + activity * 0.75 + working * 0.35;
      tail.rotation.y = Math.sin(elapsed * tailFrequency * motionScale + phase) * tailAmplitude * motionScale;
      motionRoot.position.y = lift + Math.sin(elapsed * (2.1 + activity * 2.2) + phase) * bobAmplitude * (tired ? 0.35 : 1);
      motionRoot.scale.set(1 + squash * 0.45, 1 - squash, 1 + squash * 0.45);
      group.rotation.z = THREE.MathUtils.damp(group.rotation.z, Math.sin(elapsed * 3 + phase) * 0.035 * activity, 7, delta);
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
