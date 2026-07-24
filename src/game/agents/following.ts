import * as THREE from "three";
import type { PersonalityMotion } from "./personality";

const backward = new THREE.Vector3();
const sideways = new THREE.Vector3();

export function calculateFollowTarget(
  playerPosition: THREE.Vector3,
  playerDirection: THREE.Vector3,
  motion: PersonalityMotion,
  target: THREE.Vector3,
): THREE.Vector3 {
  backward.copy(playerDirection).setY(0);
  if (backward.lengthSq() < 0.001) backward.set(0, 0, -1);
  backward.normalize().multiplyScalar(-motion.followDistance);

  sideways.set(-playerDirection.z, 0, playerDirection.x);
  if (sideways.lengthSq() < 0.001) sideways.set(1, 0, 0);
  sideways.normalize().multiplyScalar(motion.sideOffset);

  return target.copy(playerPosition).add(backward).add(sideways);
}
