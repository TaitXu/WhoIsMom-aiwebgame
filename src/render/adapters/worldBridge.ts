import * as THREE from "three";
import type { AgentId, NpcId } from "../../core/types";
import type { GameDirector } from "../../game/simulation/gameDirector";
import type { GameStore } from "../../game/state/gameStore";
import { calculateFollowTarget } from "../../game/agents/following";
import { getPersonalityMotion } from "../../game/agents/personality";
import type { ViewRegistry } from "../viewRegistry";

export interface WorldBridge {
  update(delta: number, elapsed: number, movement: THREE.Vector3): void;
  setNavigationTarget(target: THREE.Vector3 | null): void;
  teleport(checkpoint: NpcId | "pond"): void;
  reset(): void;
  getPlayerPosition(): THREE.Vector3;
}

const agentOrder: AgentId[] = ["modian", "xiaolang", "paopao"];

export function createWorldBridge(options: {
  store: GameStore;
  director: GameDirector;
  views: ViewRegistry;
  npcPositions: Record<NpcId, THREE.Vector3>;
}): WorldBridge {
  const movementDirection = new THREE.Vector3();
  const playerDirection = new THREE.Vector3(0, 0, -1);
  const followTarget = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();
  const desiredRotation = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  let navigationTarget: THREE.Vector3 | null = null;
  let autonomousEventTriggered = false;

  function moveToward(
    view: ViewRegistry["player"],
    target: THREE.Vector3,
    speed: number,
    delta: number,
  ): number {
    moveDelta.copy(target).sub(view.group.position);
    moveDelta.y = 0;
    const distance = moveDelta.length();
    if (distance > 0.001) {
      const alpha = 1 - Math.exp(-speed * delta);
      view.group.position.lerp(target, alpha);
      const desiredYaw = Math.atan2(-moveDelta.x, -moveDelta.z);
      view.group.rotation.y = dampAngle(view.group.rotation.y, desiredYaw, 8, delta);
    }
    return distance;
  }

  function updatePlayer(delta: number, movement: THREE.Vector3): number {
    const player = options.views.player.group;
    if (options.store.getState().phase === "ending") return 0;

    movementDirection.copy(movement);
    if (movementDirection.lengthSq() > 0) {
      navigationTarget = null;
    } else if (navigationTarget) {
      movementDirection.copy(navigationTarget).sub(player.position).setY(0);
      if (movementDirection.lengthSq() < 0.08) {
        navigationTarget = null;
        movementDirection.set(0, 0, 0);
      } else {
        movementDirection.normalize();
      }
    }

    const moving = movementDirection.lengthSq() > 0;
    if (moving) {
      player.position.addScaledVector(movementDirection, delta * 4.35);
      player.position.x = THREE.MathUtils.clamp(player.position.x, -4.05, 4.05);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -38.3, 3.2);
      const yaw = Math.atan2(-movementDirection.x, -movementDirection.z);
      desiredRotation.setFromAxisAngle(upAxis, yaw);
      player.quaternion.slerp(desiredRotation, 1 - Math.exp(-delta * 10));
    }
    return moving ? 4.35 : 0;
  }

  function updateProximity(): void {
    const playerPosition = options.views.player.group.position;
    let nearbyNpcId: NpcId | undefined;
    let nearestDistance = 3.8;
    (Object.keys(options.npcPositions) as NpcId[]).forEach((npcId) => {
      const distance = playerPosition.distanceTo(options.npcPositions[npcId]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearbyNpcId = npcId;
      }
    });
    const atPond = playerPosition.z < -31.3;
    options.store.dispatch({ type: "SET_PROXIMITY", npcId: nearbyNpcId, atPond });
    Object.entries(options.views.npcs).forEach(([npcId, view]) => {
      view.setHighlighted(npcId === nearbyNpcId);
    });
    Object.values(options.views.frogs).forEach((view) => view.setHighlighted(atPond));
  }

  function updateAgents(delta: number, elapsed: number): void {
    const state = options.store.getState();
    const player = options.views.player.group;
    playerDirection.set(0, 0, -1).applyQuaternion(player.quaternion);

    if (
      !autonomousEventTriggered &&
      state.phase === "explore" &&
      state.nearbyNpcId === "dragonfly" &&
      state.agents.xiaolang.mode === "following"
    ) {
      autonomousEventTriggered = options.director.startInvestigation(
        "xiaolang",
        "dragonfly",
        "appearance",
        true,
      );
    }

    agentOrder.forEach((agentId, index) => {
      const agent = options.store.getState().agents[agentId];
      const view = options.views.agents[agentId];
      const motion = getPersonalityMotion(agent.personality);
      let speed = 0;
      view.setMode(agent.mode);

      if (options.store.getState().phase === "ending") {
        const ending = options.store.getState().ending;
        const selectedFrog = ending ? options.views.frogs[ending.selectedMotherId] : undefined;
        if (selectedFrog) {
          followTarget.copy(selectedFrog.group.position);
          followTarget.x += (index - 1) * 0.7;
          followTarget.z += ending?.correct ? 1.25 + index * 0.1 : 2.6 + index * 0.15;
          speed = moveToward(view, followTarget, 3.2, delta);
        }
      } else if (agent.mode === "following" || agent.mode === "returning") {
        calculateFollowTarget(player.position, playerDirection, motion, followTarget);
        const distance = moveToward(view, followTarget, motion.speed, delta);
        speed = Math.min(distance * motion.speed, motion.speed);
        if (agent.mode === "returning" && distance < 0.28) {
          options.store.dispatch({ type: "FINISH_RETURN", agentId });
        }
      } else if (agent.mode === "approaching" && agent.activeTask) {
        followTarget.copy(options.npcPositions[agent.activeTask.npcId]);
        followTarget.z += 0.85;
        followTarget.x += (index - 1) * 0.18;
        const distance = moveToward(view, followTarget, motion.speed * 1.25, delta);
        speed = motion.speed * 1.25;
        if (distance < 0.4) options.director.arriveAtNpc(agentId, agent.activeTask.id);
      } else if (agent.mode === "discussing") {
        const discussion = options.store.getState().discussion;
        const discussionIndex = discussion?.agentIds.indexOf(agentId) ?? 0;
        followTarget.copy(player.position);
        followTarget.x += discussionIndex === 0 ? -0.52 : 0.52;
        followTarget.z += 1.05;
        speed = moveToward(view, followTarget, 3.5, delta);
      }

      view.update(elapsed, speed);
    });
  }

  function updateEnding(delta: number): void {
    const state = options.store.getState();
    if (state.phase !== "ending" || !state.ending) return;
    const selected = options.views.frogs[state.ending.selectedMotherId];
    followTarget.copy(selected.group.position);
    followTarget.z += 3.4;
    moveToward(options.views.player, followTarget, 2.8, delta);
    selected.group.rotation.y = dampAngle(
      selected.group.rotation.y,
      state.ending.correct ? 0 : Math.PI * 0.82,
      3.5,
      delta,
    );
  }

  function reset(): void {
    navigationTarget = null;
    autonomousEventTriggered = false;
    options.views.player.group.position.set(0, 0, 2.2);
    options.views.player.group.rotation.set(0, 0, 0);
    agentOrder.forEach((agentId, index) => {
      options.views.agents[agentId].group.position.set((index - 1) * 0.7, 0, 3.5 + index * 0.25);
      options.views.agents[agentId].group.rotation.set(0, 0, 0);
    });
    Object.values(options.views.frogs).forEach((view) => view.group.rotation.set(0, 0, 0));
  }

  return {
    update(delta, elapsed, movement) {
      const playerSpeed = updatePlayer(delta, movement);
      updateProximity();
      updateAgents(delta, elapsed);
      updateEnding(delta);
      options.views.player.update(elapsed, playerSpeed);
      Object.values(options.views.npcs).forEach((view) => view.update(elapsed, 0));
      Object.values(options.views.frogs).forEach((view) => view.update(elapsed, 0));
    },
    setNavigationTarget(target) {
      navigationTarget = target ? target.clone().setY(0) : null;
    },
    teleport(checkpoint) {
      const player = options.views.player.group;
      if (checkpoint === "pond") player.position.set(0, 0, -32.7);
      else {
        const npc = options.npcPositions[checkpoint];
        player.position.set(npc.x, 0, npc.z + 2.2);
      }
      navigationTarget = null;
      updateProximity();
    },
    reset,
    getPlayerPosition() {
      return options.views.player.group.position;
    },
  };
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
}
