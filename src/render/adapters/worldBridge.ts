import * as THREE from "three";
import type { AgentId, FrogId, GateId, NpcId, ObstacleId, RegionId } from "../../core/types";
import { calculateFollowTarget } from "../../game/agents/following";
import { getPersonalityMotion } from "../../game/agents/personality";
import { demoCase } from "../../game/case/demoCase";
import type { GameDirector } from "../../game/simulation/gameDirector";
import type { GameStore } from "../../game/state/gameStore";
import type { EnvironmentView } from "../environmentBuilder";
import type { ViewRegistry } from "../viewRegistry";

export interface WorldBridge {
  update(delta: number, elapsed: number, movement: THREE.Vector3): void;
  setNavigationTarget(target: THREE.Vector3 | null): void;
  teleport(checkpoint: string): void;
  reset(): void;
  getPlayerPosition(): THREE.Vector3;
  getMovementDirection(): THREE.Vector3;
}

const agentOrder: AgentId[] = ["modian", "xiaolang", "paopao"];

export function createWorldBridge(options: {
  store: GameStore;
  director: GameDirector;
  views: ViewRegistry;
  npcPositions: Record<NpcId, THREE.Vector3>;
  frogPositions: Record<FrogId, THREE.Vector3>;
  obstaclePositions: Record<ObstacleId, THREE.Vector3>;
  gatePositions: Record<GateId, THREE.Vector3>;
  environment: EnvironmentView;
}): WorldBridge {
  const inputDirection = new THREE.Vector3();
  const playerVelocity = new THREE.Vector3();
  const playerDirection = new THREE.Vector3(0, 0, -1);
  const followTarget = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();
  const targetVelocity = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  let navigationTarget: THREE.Vector3 | null = null;
  let autonomousJumpTriggered = false;

  function moveToward(view: ViewRegistry["player"], target: THREE.Vector3, speed: number, delta: number): number {
    moveDelta.copy(target).sub(view.group.position).setY(0);
    const distance = moveDelta.length();
    if (distance > 0.001) {
      const step = Math.min(distance, speed * delta);
      view.group.position.addScaledVector(moveDelta.normalize(), step);
      const desiredYaw = Math.atan2(-moveDelta.x, -moveDelta.z);
      view.group.rotation.y = dampAngle(view.group.rotation.y, desiredYaw, 9, delta);
    }
    return distance;
  }

  function updatePlayer(delta: number, movement: THREE.Vector3): number {
    const player = options.views.player.group;
    if (options.store.getState().phase === "ending") return 0;
    previousPosition.copy(player.position);
    inputDirection.copy(movement);
    if (inputDirection.lengthSq() > 0) {
      navigationTarget = null;
    } else if (navigationTarget) {
      inputDirection.copy(navigationTarget).sub(player.position).setY(0);
      if (inputDirection.lengthSq() < 0.12) {
        navigationTarget = null;
        inputDirection.set(0, 0, 0);
      } else inputDirection.normalize();
    }

    targetVelocity.copy(inputDirection).multiplyScalar(5.1);
    const lambda = inputDirection.lengthSq() > 0 ? 9 : 12;
    playerVelocity.lerp(targetVelocity, 1 - Math.exp(-lambda * delta));
    if (playerVelocity.lengthSq() < 0.002) playerVelocity.set(0, 0, 0);
    player.position.addScaledVector(playerVelocity, delta);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -26.5, 26.5);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -26.5, 26.5);

    const state = options.store.getState();
    const allKnowJump = agentOrder.every((id) => state.agents[id].jumpKnowledge === "learned");
    const enteredLockedBay = player.position.x > 9.1 && player.position.z > 9.1 && !allKnowJump;
    const crossedDragonflyGap = Math.abs(player.position.x) < 4.2 && player.position.z < -22 && previousPosition.z >= -22;
    if (enteredLockedBay || crossedDragonflyGap) {
      player.position.copy(previousPosition);
      playerVelocity.multiplyScalar(0.15);
      navigationTarget = null;
      options.store.dispatch({
        type: "SET_OBJECTIVE",
        objective: enteredLockedBay ? "三只蝌蚪都掌握跳跃后，才能通过莲叶长桥" : "这片叶隙太宽，让会跳跃的蝌蚪独自过去侦察",
      });
    }

    if (playerVelocity.lengthSq() > 0.02) {
      const yaw = Math.atan2(-playerVelocity.x, -playerVelocity.z);
      player.rotation.y = dampAngle(player.rotation.y, yaw, 10, delta);
    }
    return playerVelocity.length();
  }

  function updateWorldContext(): void {
    const state = options.store.getState();
    const position = options.views.player.group.position;
    const regionId = regionAt(position);
    const nearbyNpcId = nearest(position, options.npcPositions, 3.7);
    const nearbyFrogId = nearest(position, options.frogPositions, 3.8);
    const visibleObstacles = Object.fromEntries(
      Object.entries(options.obstaclePositions).filter(([id]) => !state.clearedObstacleIds.includes(id as ObstacleId)),
    ) as Record<ObstacleId, THREE.Vector3>;
    const nearbyObstacleId = nearest(position, visibleObstacles, 3.6);
    const nearbyGateId = nearest(position, options.gatePositions, 3.8);
    const atRestSpot = position.distanceTo(options.environment.restPosition) < 2.7;
    const discoveredEntityIds = [
      ...nearbyWithin(position, options.npcPositions, 7.5),
      ...nearbyWithin(position, options.frogPositions, 7.5),
      ...nearbyWithin(position, visibleObstacles, 6),
      ...nearbyWithin(position, options.gatePositions, 6),
    ];
    options.store.dispatch({
      type: "UPDATE_WORLD_CONTEXT",
      regionId,
      npcId: nearbyNpcId,
      frogId: nearbyFrogId,
      obstacleId: nearbyObstacleId,
      gateId: nearbyGateId,
      atRestSpot,
      discoveredEntityIds,
    });
    Object.entries(options.views.npcs).forEach(([id, view]) => view.setHighlighted(id === nearbyNpcId));
    Object.entries(options.views.frogs).forEach(([id, view]) => view.setHighlighted(id === nearbyFrogId));
    demoCase.obstacles.forEach((obstacle) => options.environment.setObstacleCleared(obstacle.id, state.clearedObstacleIds.includes(obstacle.id)));
    options.environment.setGateOpen("dragonfly-gap", state.scoutedGateIds.includes("dragonfly-gap"));
    options.environment.setGateOpen("lotus-gate", agentOrder.every((id) => state.agents[id].jumpKnowledge === "learned"));

    if (
      !autonomousJumpTriggered &&
      nearbyNpcId === "grasshopper" &&
      state.agents.xiaolang.mode === "following" &&
      state.agents.xiaolang.jumpKnowledge === "none"
    ) {
      autonomousJumpTriggered = options.director.startInvestigation(["xiaolang"], "grasshopper", "jump", true);
    }
    if (nearbyGateId === "dragonfly-gap" && !state.scoutedGateIds.includes("dragonfly-gap")) options.director.scoutGate("dragonfly-gap");
  }

  function updateAgents(delta: number, elapsed: number): void {
    const state = options.store.getState();
    const player = options.views.player.group;
    playerDirection.set(0, 0, -1).applyQuaternion(player.quaternion);

    agentOrder.forEach((agentId, index) => {
      const agent = options.store.getState().agents[agentId];
      const view = options.views.agents[agentId];
      const motion = getPersonalityMotion(agent.personality);
      let speed = 0;
      view.setMode(agent.mode);

      if (state.phase === "ending" && state.ending) {
        const selectedFrog = options.views.frogs[state.ending.selectedMotherId];
        followTarget.copy(selectedFrog.group.position);
        followTarget.x += (index - 1) * 0.72;
        followTarget.z += state.ending.correct ? 1.25 : 2.5;
        speed = moveToward(view, followTarget, 3.2, delta);
      } else if (agent.mode === "following" || agent.mode === "returning" || agent.mode === "tired") {
        calculateFollowTarget(player.position, playerDirection, motion, followTarget);
        const fatigueScale = agent.mode === "tired" ? 0.62 : 1 - agent.fatigue * 0.0035;
        const distance = moveToward(view, followTarget, motion.speed * fatigueScale, delta);
        speed = Math.min(distance * motion.speed, motion.speed) * fatigueScale;
        if (agent.mode === "returning" && distance < 0.3) options.store.dispatch({ type: "FINISH_RETURN", agentId });
      } else if (agent.mode === "approaching" && agent.activeTask) {
        const target = agent.activeTask.type === "investigation"
          ? options.npcPositions[agent.activeTask.npcId]
          : options.obstaclePositions[agent.activeTask.obstacleId];
        followTarget.copy(target);
        followTarget.x += (index - 1) * 0.3;
        followTarget.z += agent.activeTask.type === "investigation" ? 0.85 : 0.5 + index * 0.12;
        const distance = moveToward(view, followTarget, motion.speed * 1.18, delta);
        speed = motion.speed * 1.18;
        if (distance < 0.42) {
          if (agent.activeTask.type === "investigation") options.director.arriveAtNpc(agentId, agent.activeTask.id);
          else options.director.arriveAtObstacle(agentId, agent.activeTask.id);
        }
      } else if (agent.mode === "discussing") {
        const discussionIndex = options.store.getState().discussion?.agentIds.indexOf(agentId) ?? 0;
        followTarget.copy(player.position);
        followTarget.x += discussionIndex === 0 ? -0.58 : 0.58;
        followTarget.z += 1.1;
        speed = moveToward(view, followTarget, 3.4, delta);
        const partner = options.store.getState().discussion?.agentIds.find((id) => id !== agentId);
        if (partner) faceTarget(view.group, options.views.agents[partner].group.position, delta);
      }
      view.update(elapsed, speed, delta);
    });
  }

  function updateEnding(delta: number): void {
    const state = options.store.getState();
    if (state.phase !== "ending" || !state.ending) return;
    const selected = options.views.frogs[state.ending.selectedMotherId];
    followTarget.copy(selected.group.position).add(new THREE.Vector3(0, 0, 3.2));
    moveToward(options.views.player, followTarget, 2.8, delta);
    faceTarget(selected.group, options.views.player.group.position, delta);
  }

  function reset(): void {
    navigationTarget = null;
    playerVelocity.set(0, 0, 0);
    autonomousJumpTriggered = false;
    options.views.player.group.position.set(0, 0, 2.4);
    options.views.player.group.rotation.set(0, 0, 0);
    agentOrder.forEach((agentId, index) => {
      options.views.agents[agentId].group.position.set((index - 1) * 0.72, 0, 3.5 + index * 0.28);
      options.views.agents[agentId].group.rotation.set(0, 0, 0);
    });
    Object.values(options.views.frogs).forEach((view) => view.group.rotation.set(0, Math.PI, 0));
  }

  return {
    update(delta, elapsed, movement) {
      const playerSpeed = updatePlayer(delta, movement);
      updateWorldContext();
      updateAgents(delta, elapsed);
      updateEnding(delta);
      options.views.player.update(elapsed, playerSpeed, delta);
      Object.values(options.views.npcs).forEach((view) => view.update(elapsed, 0, delta));
      Object.values(options.views.frogs).forEach((view) => view.update(elapsed, 0, delta));
    },
    setNavigationTarget(target) {
      navigationTarget = target ? target.clone().setY(0) : null;
    },
    teleport(checkpoint) {
      const player = options.views.player.group;
      const position = options.npcPositions[checkpoint as NpcId]
        ?? options.frogPositions[checkpoint as FrogId]
        ?? options.obstaclePositions[checkpoint as ObstacleId]
        ?? demoCase.regions.find((region) => region.id === checkpoint)?.center;
      if (position instanceof THREE.Vector3) player.position.copy(position).add(new THREE.Vector3(0, 0, 2.4));
      else if (position) player.position.set(position[0], 0, position[2] + 2.4);
      else player.position.set(0, 0, 2.4);
      navigationTarget = null;
      playerVelocity.set(0, 0, 0);
      updateWorldContext();
    },
    reset,
    getPlayerPosition() {
      return options.views.player.group.position;
    },
    getMovementDirection() {
      return inputDirection;
    },
  };
}

function regionAt(position: THREE.Vector3): RegionId {
  const gridX = position.x < -9 ? -1 : position.x > 9 ? 1 : 0;
  const gridZ = position.z < -9 ? -1 : position.z > 9 ? 1 : 0;
  return demoCase.regions.find((region) => region.grid[0] === gridX && region.grid[1] === gridZ)!.id;
}

function nearest<T extends string>(position: THREE.Vector3, positions: Record<T, THREE.Vector3>, range: number): T | undefined {
  let result: T | undefined;
  let best = range;
  (Object.keys(positions) as T[]).forEach((id) => {
    const distance = position.distanceTo(positions[id]);
    if (distance < best) {
      best = distance;
      result = id;
    }
  });
  return result;
}

function nearbyWithin<T extends string>(position: THREE.Vector3, positions: Record<T, THREE.Vector3>, range: number): string[] {
  return (Object.keys(positions) as T[]).filter((id) => position.distanceTo(positions[id]) < range);
}

function faceTarget(group: THREE.Object3D, target: THREE.Vector3, delta: number): void {
  const dx = target.x - group.position.x;
  const dz = target.z - group.position.z;
  group.rotation.y = dampAngle(group.rotation.y, Math.atan2(-dx, -dz), 7, delta);
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
}
