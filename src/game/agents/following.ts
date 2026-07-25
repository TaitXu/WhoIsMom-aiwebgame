import * as THREE from "three";
import type { PersonalityMotion } from "./personality";

const backward = new THREE.Vector3();
const sideways = new THREE.Vector3();
const activitySide = new THREE.Vector3();
const activityDirection = new THREE.Vector3();
const activityOffset = new THREE.Vector3();

export function calculateFollowTarget(
  playerPosition: THREE.Vector3,
  playerDirection: THREE.Vector3,
  motion: PersonalityMotion,
  target: THREE.Vector3,
): THREE.Vector3;
export function calculateFollowTarget(
  playerPosition: THREE.Vector3,
  playerDirection: THREE.Vector3,
  motion: PersonalityMotion,
  agentIndex: number,
  target: THREE.Vector3,
): THREE.Vector3;
export function calculateFollowTarget(
  playerPosition: THREE.Vector3,
  playerDirection: THREE.Vector3,
  motion: PersonalityMotion,
  agentIndexOrTarget: number | THREE.Vector3,
  maybeTarget?: THREE.Vector3,
): THREE.Vector3 {
  const agentIndex = typeof agentIndexOrTarget === "number" ? agentIndexOrTarget : 1;
  const target = typeof agentIndexOrTarget === "number" ? maybeTarget! : agentIndexOrTarget;
  const slotSideOffset = (agentIndex - 1) * 1.35;
  const slotBackOffset = agentIndex === 0 ? 0.15 : agentIndex === 1 ? 0.62 : 0.32;
  backward.copy(playerDirection).setY(0);
  if (backward.lengthSq() < 0.001) backward.set(0, 0, -1);
  backward.normalize().multiplyScalar(-(motion.followDistance + slotBackOffset));

  sideways.set(-playerDirection.z, 0, playerDirection.x);
  if (sideways.lengthSq() < 0.001) sideways.set(1, 0, 0);
  sideways.normalize().multiplyScalar(slotSideOffset + motion.sideOffset * 0.28);

  return target.copy(playerPosition).add(backward).add(sideways);
}

/**
 * Low-frequency deterministic activity target. A future LLM movement intent
 * changes the behavior parameters, while this function remains responsible
 * for continuous local movement and the hard following radius.
 */
export function calculateActivityTarget(
  playerPosition: THREE.Vector3,
  playerDirection: THREE.Vector3,
  motion: PersonalityMotion,
  personality: "cautious" | "impulsive" | "social",
  agentIndex: number,
  elapsed: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  activityDirection.copy(playerDirection).setY(0);
  if (activityDirection.lengthSq() < 0.001) activityDirection.set(0, 0, -1);
  activityDirection.normalize();
  activitySide.set(-activityDirection.z, 0, activityDirection.x).normalize();

  const phase = agentIndex * 1.9;
  const orbit = Math.sin(elapsed * (0.32 + agentIndex * 0.04) + phase);
  const drift = Math.sin(elapsed * 0.21 + phase * 1.7);
  const radius = personality === "impulsive" ? 2.15 : personality === "social" ? 1.55 : 1.05;
  const ahead = personality === "impulsive" ? 0.85 : personality === "cautious" ? -0.25 : 0.1;
  const side = personality === "social" ? orbit * 0.95 : orbit * 0.55;
  const slotSideOffset = (agentIndex - 1) * 1.35;
  const slotBackOffset = agentIndex === 0 ? 0.15 : agentIndex === 1 ? 0.62 : 0.32;

  target.copy(playerPosition)
    .addScaledVector(activityDirection, -(motion.followDistance + slotBackOffset) + ahead + drift * 0.18)
    .addScaledVector(activitySide, slotSideOffset + motion.sideOffset * 0.28 + side)
    .setY(0);
  activityOffset.copy(target).sub(playerPosition).setY(0);
  if (activityOffset.length() > radius + motion.followDistance) {
    activityOffset.setLength(radius + motion.followDistance);
    target.copy(playerPosition).add(activityOffset).setY(0);
  }
  return target;
}
