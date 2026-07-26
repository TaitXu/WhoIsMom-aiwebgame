import * as THREE from "three";
import type { AgentId, AgentState, FrogId, GateId, NpcId, ObstacleId, RegionId } from "../../core/types";
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
  whistle(radius?: number): number;
  getPlayerPosition(): THREE.Vector3;
  getMovementDirection(): THREE.Vector3;
}

const agentOrder: AgentId[] = ["modian", "xiaolang", "paopao"];
// Navigation footprints are intentionally smaller than the stylized meshes so
// narrow channels remain traversable without changing the visible characters.
const PLAYER_COLLISION_RADIUS = 0.48;
const AGENT_COLLISION_RADIUS = 0.32;
const CHARACTER_GAP = 0.24;
const STEERING_ANGLES = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, Math.PI / 2, -Math.PI / 2];
const STUCK_THRESHOLD = 0.65;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const GATE_JUMP_DURATION = 0.95;

type GateJumpAnimation = {
  key: string;
  gateId: GateId;
  returning: boolean;
  elapsed: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
};

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
  const requestedStep = new THREE.Vector3();
  const appliedStep = new THREE.Vector3();
  const candidatePosition = new THREE.Vector3();
  const approachDirection = new THREE.Vector3();
  const approachCandidate = new THREE.Vector3();
  const characterDelta = new THREE.Vector3();
  const separation = new THREE.Vector3();
  const separationTarget = new THREE.Vector3();
  const steeringCandidate = new THREE.Vector3();
  const steeringDirection = new THREE.Vector3();
  const targetVelocity = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const recoveryTarget = new THREE.Vector3();
  const discussionAnchor = new THREE.Vector3();
  const discussionAxis = new THREE.Vector3(1, 0, 0);
  const whistleRipple = new THREE.Group();
  const whistleRings: THREE.Mesh[] = [];
  let whistleElapsed = -1;
  let navigationTarget: THREE.Vector3 | null = null;
  const autonomousNpcTriggers = new Set<string>();
  let travelFatigueDistance = 0;
  let playerBlockedTime = 0;
  const agentBlockedTime: Record<AgentId, number> = { modian: 0, xiaolang: 0, paopao: 0 };
  const agentFreeTime: Record<AgentId, number> = { modian: 0, xiaolang: 0, paopao: 0 };
  const agentRecoveryAttempts: Record<AgentId, number> = { modian: 0, xiaolang: 0, paopao: 0 };
  const steeringPreference = new WeakMap<THREE.Group, number>();
  const gateJumpAnimations = new Map<AgentId, GateJumpAnimation>();
  const gateRoamAnchors = new Map<AgentId, THREE.Vector3>();
  let activeDiscussionAnchorId: string | undefined;

  for (let index = 0; index < 2; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xd7fff2, transparent: true, opacity: 0, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.018 + index * 0.006;
    whistleRipple.add(ring);
    whistleRings.push(ring);
  }
  whistleRipple.visible = false;
  options.environment.group.add(whistleRipple);

  function canOccupyTerrain(position: THREE.Vector3, radius: number): boolean {
    return options.environment.canOccupy(position, radius);
  }

  // Actors separate their desired targets, but never become physical walls for
  // one another. This preserves formation spacing without creating deadlocks.
  function applySoftSeparation(target: THREE.Vector3, radius: number, ignore: THREE.Group): void {
    separation.set(0, 0, 0);
    const separateFrom = (other: THREE.Group, otherRadius: number): void => {
      if (other === ignore) return;
      characterDelta.copy(ignore.position).sub(other.position).setY(0);
      const minimumDistance = radius + otherRadius + CHARACTER_GAP;
      const distance = characterDelta.length();
      if (distance >= minimumDistance) return;
      if (distance < 0.001) characterDelta.set(0, 0, 1);
      else characterDelta.normalize();
      separation.addScaledVector(characterDelta, (minimumDistance - distance) * 1.12);
    };

    separateFrom(options.views.player.group, PLAYER_COLLISION_RADIUS);
    agentOrder.forEach((agentId) => separateFrom(options.views.agents[agentId].group, AGENT_COLLISION_RADIUS));
    if (separation.lengthSq() < 0.000001) return;
    separationTarget.copy(target);
    target.add(separation).setY(0);
    if (!canOccupyTerrain(target, radius)) target.copy(separationTarget);
  }

  function tryMove(view: ViewRegistry["player"], displacement: THREE.Vector3, radius: number): THREE.Vector3 {
    appliedStep.set(0, 0, 0);
    if (displacement.lengthSq() < 0.000001) return appliedStep;

    steeringDirection.copy(displacement).normalize();
    const preference = steeringPreference.get(view.group) ?? 1;
    let bestScore = -Infinity;
    let bestAngle = 0;
    let bestScale = 0;
    for (const angle of STEERING_ANGLES) {
      const preferredAngle = angle === 0 ? 0 : angle * preference;
      for (const scale of [1, 0.72, 0.42]) {
        steeringCandidate.copy(displacement).multiplyScalar(scale).applyAxisAngle(Y_AXIS, preferredAngle);
        candidatePosition.copy(view.group.position).add(steeringCandidate);
        if (!canOccupyTerrain(candidatePosition, radius)) continue;
        const length = steeringCandidate.length();
        const alignment = steeringCandidate.dot(steeringDirection) / Math.max(length, 0.0001);
        const score = alignment * 0.78 + (length / displacement.length()) * 0.22;
        if (score > bestScore) {
          bestScore = score;
          bestAngle = preferredAngle;
          bestScale = scale;
        }
      }
    }
    if (bestScore > -Infinity) {
      steeringCandidate.copy(displacement).multiplyScalar(bestScale).applyAxisAngle(Y_AXIS, bestAngle);
      view.group.position.add(steeringCandidate);
      appliedStep.copy(steeringCandidate);
      if (Math.abs(bestAngle) > 0.05) steeringPreference.set(view.group, Math.sign(bestAngle));
    }
    return appliedStep;
  }

  function moveToward(view: ViewRegistry["player"], target: THREE.Vector3, speed: number, delta: number, radius: number): number {
    appliedStep.set(0, 0, 0);
    requestedStep.set(0, 0, 0);
    moveDelta.copy(target).sub(view.group.position).setY(0);
    const distance = moveDelta.length();
    if (distance > 0.04) {
      const step = Math.min(distance, speed * delta);
      requestedStep.copy(moveDelta).normalize().multiplyScalar(step);
      tryMove(view, requestedStep, radius);
      // Only re-face when there is real ground to cover. Right on top of the
      // target the direction vector is near-zero and flips frame-to-frame,
      // which makes the model look like it is shaking in place.
      if (distance > 0.12) {
        const desiredYaw = Math.atan2(-moveDelta.x, -moveDelta.z);
        view.group.rotation.y = dampAngle(view.group.rotation.y, desiredYaw, 9, delta);
      }
    }
    return moveDelta.copy(target).sub(view.group.position).setY(0).length();
  }

  function movementWasBlocked(): boolean {
    return requestedStep.lengthSq() > 0.00001 && appliedStep.lengthSq() < requestedStep.lengthSq() * 0.04;
  }

  function trackAgentRecovery(agentId: AgentId, agentIndex: number, delta: number): void {
    const view = options.views.agents[agentId];
    const blocked = movementWasBlocked();
    agentBlockedTime[agentId] = blocked ? agentBlockedTime[agentId] + delta : 0;
    agentFreeTime[agentId] = blocked ? 0 : agentFreeTime[agentId] + delta;
    if (agentFreeTime[agentId] >= 1.4) agentRecoveryAttempts[agentId] = 0;
    const mode = options.store.getState().agents[agentId].mode;
    if (
      (mode === "following" || mode === "returning" || mode === "tired") &&
      view.group.position.distanceTo(options.views.player.group.position) > 14
    ) {
      repositionAgentNearPlayer(agentId, agentIndex);
      return;
    }
    if (agentBlockedTime[agentId] < STUCK_THRESHOLD) return;
    const agent = options.store.getState().agents[agentId];
    agentRecoveryAttempts[agentId] += 1;
    if (agent.mode === "approaching" || agent.mode === "following" || agent.mode === "tired") {
      options.director.recall(agentId);
    }
    steeringPreference.set(view.group, -(steeringPreference.get(view.group) ?? 1));
    agentBlockedTime[agentId] = 0;
    if (agentRecoveryAttempts[agentId] >= 2) repositionAgentNearPlayer(agentId, agentIndex);
  }

  function repositionAgentNearPlayer(agentId: AgentId, agentIndex: number): void {
    const view = options.views.agents[agentId];
    const motion = getPersonalityMotion(options.store.getState().agents[agentId].personality);
    calculateFollowTarget(options.views.player.group.position, playerDirection, motion, agentIndex, recoveryTarget);
    recoveryTarget.copy(nearestWalkableApproach(recoveryTarget, options.views.player.group.position, AGENT_COLLISION_RADIUS));
    view.group.position.copy(recoveryTarget).setY(0);
    agentBlockedTime[agentId] = 0;
    agentFreeTime[agentId] = 0;
    agentRecoveryAttempts[agentId] = 0;
    steeringPreference.set(view.group, agentIndex === 0 ? -1 : 1);
  }

  function nearestWalkableApproach(target: THREE.Vector3, from: THREE.Vector3, radius: number): THREE.Vector3 {
    if (canOccupyTerrain(target, radius)) return approachCandidate.copy(target).setY(0);
    approachDirection.copy(from).sub(target).setY(0);
    if (approachDirection.lengthSq() < 0.0001) approachDirection.set(0, 0, 1);
    else approachDirection.normalize();
    const basisAngle = Math.atan2(approachDirection.x, approachDirection.z);
    for (const distance of [0.45, 0.85, 1.3, 1.8, 2.4, 3.2, 4.2, 5]) {
      for (let index = 0; index < 16; index += 1) {
        const angle = basisAngle + (index / 16) * Math.PI * 2;
        approachCandidate.set(
          target.x + Math.sin(angle) * distance,
          0,
          target.z + Math.cos(angle) * distance,
        );
        if (canOccupyTerrain(approachCandidate, radius)) return approachCandidate;
      }
    }
    return target;
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
    requestedStep.copy(playerVelocity).multiplyScalar(delta);
    tryMove(options.views.player, requestedStep, PLAYER_COLLISION_RADIUS);
    playerBlockedTime = inputDirection.lengthSq() > 0 && movementWasBlocked() ? playerBlockedTime + delta : 0;
    if (playerBlockedTime >= STUCK_THRESHOLD) {
      navigationTarget = null;
      playerVelocity.multiplyScalar(0.15);
      steeringPreference.set(player, -(steeringPreference.get(player) ?? 1));
      playerBlockedTime = 0;
    }
    if (delta > 0) playerVelocity.copy(appliedStep).divideScalar(delta);
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
    const revealedFrogPositions = state.candidateFrogsRevealed ? options.frogPositions : {} as Record<FrogId, THREE.Vector3>;
    const nearbyFrogId = nearest(position, revealedFrogPositions, 3.8);
    const visibleObstacles = Object.fromEntries(
      Object.entries(options.obstaclePositions).filter(([id]) => !state.clearedObstacleIds.includes(id as ObstacleId)),
    ) as Record<ObstacleId, THREE.Vector3>;
    const nearbyObstacleId = nearest(position, visibleObstacles, 3.6);
    const nearbyGateId = nearest(position, options.gatePositions, 3.8);
    const atRestSpot = position.distanceTo(options.environment.restPosition) < 2.7;
    const discoveredEntityIds = [
      ...nearbyWithin(position, options.npcPositions, 7.5),
      ...nearbyWithin(position, revealedFrogPositions, 7.5),
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
    Object.entries(options.views.frogs).forEach(([id, view]) => view.setHighlighted(state.candidateFrogsRevealed && id === nearbyFrogId));
    demoCase.obstacles.forEach((obstacle) => options.environment.setObstacleCleared(obstacle.id, state.clearedObstacleIds.includes(obstacle.id)));
    options.environment.setGateOpen("dragonfly-gap", state.scoutedGateIds.includes("dragonfly-gap"));
    options.environment.setGateOpen("lotus-gate", agentOrder.every((id) => state.agents[id].jumpKnowledge === "learned"));

    const autonomousAgentId = agentOrder.find((id) => {
      const agent = state.agents[id];
      return agent.personality === "impulsive" && agent.mode === "following" && agent.fatigue < 70;
    });
    if (nearbyNpcId && autonomousAgentId && (nearbyNpcId !== "dragonfly" || state.scoutedGateIds.includes("dragonfly-gap"))) {
      const triggerKey = `${autonomousAgentId}:${nearbyNpcId}`;
      if (!autonomousNpcTriggers.has(triggerKey)) {
        const npc = demoCase.npcs.find((candidate) => candidate.id === nearbyNpcId)!;
        const agent = state.agents[autonomousAgentId];
        const topic = nearbyNpcId === "grasshopper" && agent.jumpKnowledge === "none"
          ? "jump"
          : npc.topics.find((candidate) => !agent.memories.some((memory) => memory?.sourceNpcId === nearbyNpcId && memory.topic === candidate));
        if (topic && options.director.startInvestigation([autonomousAgentId], nearbyNpcId, topic, true)) {
          autonomousNpcTriggers.add(triggerKey);
        }
      }
    }
  }

  function syncDiscussionAnchor(): void {
    const discussion = options.store.getState().discussion;
    if (!discussion) {
      activeDiscussionAnchorId = undefined;
      return;
    }
    if (discussion.id === activeDiscussionAnchorId) return;
    const first = options.views.agents[discussion.agentIds[0]].group.position;
    const second = options.views.agents[discussion.agentIds[1]].group.position;
    discussionAnchor.copy(first).add(second).multiplyScalar(0.5).setY(0);
    discussionAxis.copy(second).sub(first).setY(0);
    if (discussionAxis.lengthSq() < 0.01) discussionAxis.set(-playerDirection.z, 0, playerDirection.x);
    discussionAxis.normalize();
    activeDiscussionAnchorId = discussion.id;
  }

  function animateGateTransition(
    agentId: AgentId,
    agentIndex: number,
    agent: AgentState,
    delta: number,
  ): boolean {
    const outgoingTask = agent.mode === "jumping" && agent.activeTask?.type === "investigation" && agent.activeTask.viaGateId
      ? agent.activeTask
      : undefined;
    const returningGateId = agent.mode === "returning" ? agent.returnGateId : undefined;
    const gateId = outgoingTask?.viaGateId ?? returningGateId;
    if (!gateId) {
      gateJumpAnimations.delete(agentId);
      return false;
    }
    const returning = Boolean(returningGateId);
    const key = returning ? `return:${gateId}` : outgoingTask!.id;
    let animation = gateJumpAnimations.get(agentId);
    if (!animation || animation.key !== key) {
      const gate = options.gatePositions[gateId];
      const end = new THREE.Vector3(
        gate.x + (agentIndex - 1) * 0.28,
        0,
        gate.z + (returning ? 2.25 : -2.35),
      );
      animation = {
        key,
        gateId,
        returning,
        elapsed: 0,
        start: options.views.agents[agentId].group.position.clone().setY(0),
        end,
      };
      gateJumpAnimations.set(agentId, animation);
    }
    animation.elapsed += delta;
    const progress = THREE.MathUtils.clamp(animation.elapsed / GATE_JUMP_DURATION, 0, 1);
    const view = options.views.agents[agentId];
    view.group.position.lerpVectors(animation.start, animation.end, progress);
    view.group.position.y = Math.sin(progress * Math.PI) * 1.18;
    faceTarget(view.group, animation.end, delta);
    if (progress < 1) return true;
    view.group.position.copy(animation.end);
    gateJumpAnimations.delete(agentId);
    agentBlockedTime[agentId] = 0;
    if (animation.returning) options.director.finishGateReturn(agentId, animation.gateId);
    else {
      gateRoamAnchors.set(agentId, animation.end.clone());
      options.director.finishGateJump(agentId, outgoingTask!.id);
    }
    return true;
  }

  function updateAgents(delta: number, elapsed: number): void {
    const state = options.store.getState();
    const player = options.views.player.group;
    playerDirection.set(0, 0, -1).applyQuaternion(player.quaternion);
    syncDiscussionAnchor();

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
        applySoftSeparation(followTarget, AGENT_COLLISION_RADIUS, view.group);
        speed = moveToward(view, followTarget, 3.2, delta, AGENT_COLLISION_RADIUS);
        trackAgentRecovery(agentId, index, delta);
      } else if (animateGateTransition(agentId, index, agent, delta)) {
        speed = 5.2;
      } else if (agent.mode === "considering" && agent.activeTask?.type === "investigation" && agent.activeTask.viaGateId) {
        const anchor = gateRoamAnchors.get(agentId) ?? view.group.position;
        const roamAngle = elapsed * 1.7 + index * 2.1;
        followTarget.copy(anchor).add(new THREE.Vector3(Math.cos(roamAngle) * 0.82, 0, Math.sin(roamAngle) * 0.56));
        followTarget.copy(nearestWalkableApproach(followTarget, view.group.position, AGENT_COLLISION_RADIUS));
        speed = moveToward(view, followTarget, motion.speed * 0.62, delta, AGENT_COLLISION_RADIUS);
      } else if (agent.mode === "following" || agent.mode === "returning" || agent.mode === "tired") {
        gateRoamAnchors.delete(agentId);
        // Always hold the stable formation slot. The previous idle orbit
        // (calculateActivityTarget) drifted the target slowly enough that the
        // movement dead-zone turned that drift into discrete micro-steps plus
        // intermittent re-facing — exactly the "jitter" the eye picks up.
        // A stable slot lets idle animation (tail swing + body bob) carry the
        // alive feel without any position noise.
        calculateFollowTarget(player.position, playerDirection, motion, index, followTarget);
        applySoftSeparation(followTarget, AGENT_COLLISION_RADIUS, view.group);
        const fatigueScale = agent.mode === "tired" ? 0.62 : 1 - agent.fatigue * 0.0035;
        const distance = moveToward(view, followTarget, motion.speed * fatigueScale, delta, AGENT_COLLISION_RADIUS);
        trackAgentRecovery(agentId, index, delta);
        speed = Math.min(distance * motion.speed, motion.speed) * fatigueScale;
        if (
          agent.mode === "returning" &&
          (distance < 0.3 || view.group.position.distanceTo(player.position) < 4.2)
        ) options.store.dispatch({ type: "FINISH_RETURN", agentId });
        // Idle glance: a settled follower eases its facing toward the leader's
        // heading with a glacial sway, so it reads as alert without chasing a
        // moving target — the old jitter path. Only when truly settled (well
        // inside the re-face dead-zone), so it never fights moveToward.
        if (agent.mode === "following" && distance < 0.12) {
          const baseYaw = Math.atan2(-playerDirection.x, -playerDirection.z);
          const sway = Math.sin(elapsed * 0.45 + index * 2.1) * 0.16;
          view.group.rotation.y = dampAngle(view.group.rotation.y, baseYaw + sway, 1.5, delta);
        }
      } else if (agent.mode === "approaching" && agent.activeTask) {
        gateRoamAnchors.delete(agentId);
        const target = agent.activeTask.type === "investigation"
          ? options.npcPositions[agent.activeTask.npcId]
          : options.obstaclePositions[agent.activeTask.obstacleId];
        followTarget.copy(target);
        followTarget.x += (index - 1) * 0.3;
        followTarget.z += agent.activeTask.type === "investigation" ? 0.85 : 0.5 + index * 0.12;
        followTarget.copy(nearestWalkableApproach(followTarget, view.group.position, AGENT_COLLISION_RADIUS));
        applySoftSeparation(followTarget, AGENT_COLLISION_RADIUS, view.group);
        const distance = moveToward(view, followTarget, motion.speed * 1.18, delta, AGENT_COLLISION_RADIUS);
        trackAgentRecovery(agentId, index, delta);
        speed = motion.speed * 1.18;
        if (distance < 0.72) {
          if (agent.activeTask.type === "investigation") options.director.arriveAtNpc(agentId, agent.activeTask.id);
          else options.director.arriveAtObstacle(agentId, agent.activeTask.id);
        }
      } else if (agent.mode === "discussing") {
        const discussionIndex = options.store.getState().discussion?.agentIds.indexOf(agentId) ?? 0;
        followTarget.copy(discussionAnchor).addScaledVector(discussionAxis, discussionIndex === 0 ? -0.72 : 0.72);
        followTarget.copy(nearestWalkableApproach(followTarget, view.group.position, AGENT_COLLISION_RADIUS));
        applySoftSeparation(followTarget, AGENT_COLLISION_RADIUS, view.group);
        speed = moveToward(view, followTarget, 3.4, delta, AGENT_COLLISION_RADIUS);
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
    followTarget.copy(nearestWalkableApproach(followTarget, options.views.player.group.position, PLAYER_COLLISION_RADIUS));
    moveToward(options.views.player, followTarget, 2.8, delta, PLAYER_COLLISION_RADIUS);
    faceTarget(selected.group, options.views.player.group.position, delta);
  }

  function updateWhistleRipple(delta: number): void {
    if (whistleElapsed < 0) return;
    whistleElapsed += delta;
    const duration = 0.9;
    const progress = THREE.MathUtils.clamp(whistleElapsed / duration, 0, 1);
    whistleRings.forEach((ring, index) => {
      const offset = index * 0.14;
      const ringProgress = THREE.MathUtils.clamp((whistleElapsed - offset) / (duration - offset), 0, 1);
      const scale = 1 + ringProgress * 7.5;
      ring.scale.setScalar(scale);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - ringProgress) * 0.72;
    });
    if (progress >= 1) {
      whistleElapsed = -1;
      whistleRipple.visible = false;
    }
  }

  function whistle(radius = 7.5): number {
    const center = options.views.player.group.position;
    whistleRipple.position.copy(center).setY(0);
    whistleRipple.visible = true;
    whistleElapsed = 0;
    whistleRings.forEach((ring) => {
      ring.scale.setScalar(1);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.72;
    });
    let recalled = 0;
    agentOrder.forEach((agentId) => {
      const agent = options.views.agents[agentId];
      if (agent.group.position.distanceTo(center) <= radius && options.director.recall(agentId)) recalled += 1;
    });
    return recalled;
  }

  function reset(): void {
    navigationTarget = null;
    playerVelocity.set(0, 0, 0);
    playerBlockedTime = 0;
    agentOrder.forEach((agentId) => { agentBlockedTime[agentId] = 0; });
    agentOrder.forEach((agentId) => {
      agentFreeTime[agentId] = 0;
      agentRecoveryAttempts[agentId] = 0;
    });
    gateJumpAnimations.clear();
    gateRoamAnchors.clear();
    activeDiscussionAnchorId = undefined;
    autonomousNpcTriggers.clear();
    travelFatigueDistance = 0;
    options.views.player.group.position.set(0, 0, 2.4);
    options.views.player.group.rotation.set(0, 0, 0);
    agentOrder.forEach((agentId, index) => {
      options.views.agents[agentId].group.position.set((index - 1) * 0.95, 0, 3.5 + index * 0.34);
      options.views.agents[agentId].group.rotation.set(0, 0, 0);
    });
    Object.values(options.views.frogs).forEach((view) => view.group.rotation.set(0, Math.PI, 0));
  }

  return {
    update(delta, elapsed, movement) {
      const playerSpeed = updatePlayer(delta, movement);
      travelFatigueDistance += playerSpeed * delta;
      if (travelFatigueDistance >= 14) {
        travelFatigueDistance -= 14;
        const state = options.store.getState();
        const movingAgentIds = agentOrder.filter((id) => state.agents[id].mode === "following" || state.agents[id].mode === "returning");
        options.store.dispatch({ type: "ADD_FATIGUE", agentIds: movingAgentIds, amount: 2, reason: "movement" });
      }
      updateWorldContext();
      updateAgents(delta, elapsed);
      updateEnding(delta);
      updateWhistleRipple(delta);
      options.views.player.update(elapsed, playerSpeed, delta);
      Object.values(options.views.npcs).forEach((view) => view.update(elapsed, 0, delta));
      Object.values(options.views.frogs).forEach((view) => view.update(elapsed, 0, delta));
    },
    setNavigationTarget(target) {
      if (!target) {
        navigationTarget = null;
        return;
      }
      navigationTarget = nearestWalkableApproach(
        target,
        options.views.player.group.position,
        PLAYER_COLLISION_RADIUS,
      ).clone().setY(0);
      playerBlockedTime = 0;
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
      playerBlockedTime = 0;
      updateWorldContext();
    },
    reset,
    whistle,
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
