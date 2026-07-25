import * as THREE from "three";
import type { AgentId, FrogId, GateId, NpcId, ObstacleId, GeneratedCast } from "../core/types";
import { createAgentService } from "../ai/agentService";
import { createLocalAgentFallback } from "../ai/localAgentFallback";
import { createLlmConfigStore } from "../ai/llmConfig";
import { createRemoteAgentAdapter } from "../ai/remoteAgentAdapter";
import { createDebugPanel } from "../diagnostics/createDebugPanel";
import { demoCase } from "../game/case/demoCase";
import {
  describeFrogFeatures,
  frogFeatureConstraints,
  frogFeatureVocabulary,
} from "../game/case/frogFeatures";
import { createGameDirector } from "../game/simulation/gameDirector";
import { createInitialGameState } from "../game/state/gameState";
import { createGameStore } from "../game/state/gameStore";
import { createInputController } from "../input/keyboardController";
import { createPointerController, type InteractiveTarget } from "../input/pointerController";
import { createFrog, createNpc, createPlayerFish, createTadpole } from "../render/characterFactory";
import { createRenderHost } from "../render/createRenderHost";
import { createWorldBridge } from "../render/adapters/worldBridge";
import type { ViewRegistry } from "../render/viewRegistry";
import { createHud, type WorldOverlays } from "../ui/createHud";
import { createGameLoop } from "./gameLoop";

export interface GameApp {
  start(): void;
  dispose(): void;
}

const agentOrder: AgentId[] = ["modian", "xiaolang", "paopao"];

export function createGameApp(options: { root: HTMLElement; canvas: HTMLCanvasElement }): GameApp {
  const host = createRenderHost(options.canvas);
  const store = createGameStore(createInitialGameState());
  const llmConfig = createLlmConfigStore();
  const service = createAgentService(createRemoteAgentAdapter("/api/agent", 22_000, llmConfig), createLocalAgentFallback());
  const director = createGameDirector({ store, service });
  let gameStarted = false;

  async function startGame(): Promise<void> {
    const response = await service.generateCast({
      requestId: `cast-${Date.now()}`,
      task: "generate_cast",
      seed: store.getState().sessionSeed,
      agentIds: [...agentOrder],
      frogIds: demoCase.candidates.map((candidate) => candidate.id),
      motherId: demoCase.motherId,
      featureVocabulary: frogFeatureVocabulary,
      requiredFeatures: frogFeatureConstraints,
    });
    if (response.result.task !== "generate_cast") throw new Error("Invalid cast result");
    const cast: GeneratedCast = {
      agents: Object.fromEntries(response.result.agents.map((profile) => [profile.id, {
        name: profile.name,
        personality: profile.personality,
        introduction: profile.introduction,
      }])) as GeneratedCast["agents"],
      frogs: Object.fromEntries(response.result.frogs.map((profile) => [profile.id, {
        name: profile.name,
        appearance: describeFrogFeatures(profile.features),
        features: profile.features,
      }])) as GeneratedCast["frogs"],
    };
    response.result.frogs.forEach((profile) => views.frogs[profile.id].applyAppearance(profile.features));
    store.dispatch({ type: "APPLY_GENERATED_CAST", cast });
    gameStarted = true;
  }

  const player = createPlayerFish(host.palette);
  host.worldRoot.add(player.group);

  const agents = Object.fromEntries(
    agentOrder.map((agentId, index) => {
      const state = store.getState().agents[agentId];
      const view = createTadpole(agentId, state.personality, host.palette, index * 1.7);
      host.worldRoot.add(view.group);
      return [agentId, view];
    }),
  ) as ViewRegistry["agents"];

  const npcPositions = {} as Record<NpcId, THREE.Vector3>;
  const npcs = Object.fromEntries(
    demoCase.npcs.map((definition) => {
      const view = createNpc(definition.id, host.palette);
      view.group.position.set(definition.position[0], definition.position[1], definition.position[2]);
      npcPositions[definition.id] = view.group.position;
      host.worldRoot.add(view.group);
      return [definition.id, view];
    }),
  ) as ViewRegistry["npcs"];

  const frogPositions = {} as Record<FrogId, THREE.Vector3>;
  const frogs = Object.fromEntries(
    demoCase.candidates.map((definition) => {
      const view = createFrog(definition, host.palette);
      view.group.position.set(definition.position[0], definition.position[1], definition.position[2]);
      view.group.rotation.y = Math.PI;
      frogPositions[definition.id] = view.group.position;
      host.worldRoot.add(view.group);
      return [definition.id, view];
    }),
  ) as ViewRegistry["frogs"];

  const obstaclePositions = Object.fromEntries(
    demoCase.obstacles.map((definition) => [definition.id, host.environment.obstacles[definition.id].position]),
  ) as Record<ObstacleId, THREE.Vector3>;
  const gatePositions = Object.fromEntries(
    demoCase.gates.map((definition) => [definition.id, host.environment.gates[definition.id].position]),
  ) as Record<GateId, THREE.Vector3>;

  const views: ViewRegistry = { player, agents, npcs, frogs };
  const world = createWorldBridge({
    store,
    director,
    views,
    npcPositions,
    frogPositions,
    obstaclePositions,
    gatePositions,
    environment: host.environment,
  });
  world.reset();

  const selectAgent = (agentId?: AgentId): void => store.dispatch({ type: "SELECT_AGENT", agentId });
  const selectAgents = (agentIds: AgentId[]): void => store.dispatch({ type: "SELECT_AGENTS", agentIds });
  const setFailureObjective = (message: string): void => store.dispatch({ type: "SET_OBJECTIVE", objective: message });
  const attemptScoutGate = (gateId: GateId): boolean => {
    const state = store.getState();
    if (state.nearbyGateId !== gateId) {
      setFailureObjective("先带队靠近叶隙，再点击障碍");
      return false;
    }
    if (state.selectedAgentIds.length !== 1 || !state.selectedAgentId) {
      setFailureObjective("请只选择一只会跳跃的蝌蚪，再点击叶隙");
      return false;
    }
    const scout = state.agents[state.selectedAgentId];
    if (scout.jumpKnowledge !== "learned") {
      setFailureObjective(`${scout.name}还没有真正掌握跳跃`);
      return false;
    }
    if (scout.mode !== "following" || scout.fatigue >= 90) {
      setFailureObjective(`${scout.name}现在无法越过叶隙，先让它回队休息`);
      return false;
    }
    if (!director.scoutGate(gateId, scout.id)) {
      setFailureObjective("这处叶隙已经侦察过，或当前不适合起跳");
      return false;
    }
    return true;
  };

  const hud = createHud({
    root: options.root,
    llmConfig,
    onStart: startGame,
    onSelect: selectAgent,
    onRecall: (agentId) => director.recall(agentId),
    onInvestigate: (agentIds, npcId) => {
      if (!director.startConversation(agentIds, npcId)) setFailureObjective("先选择空闲、没那么疲惫的蝌蚪再聊天");
    },
    onCleanup: (agentIds, obstacleId) => {
      if (!director.startCleanup(agentIds, obstacleId)) setFailureObjective("换一组空闲、没那么疲惫的蝌蚪再试试");
    },
    onDiscuss: (firstId, secondId, topic) => {
      if (!director.startDiscussion(firstId, secondId, topic)) setFailureObjective("它们还没有可以互相核对的记忆");
    },
    onTeachJump: (teacherId, studentId) => {
      if (!director.teachJump(teacherId, studentId)) setFailureObjective("教学需要两只蝌蚪都回到队伍并保持清醒");
    },
    onUpgradeMemory: (agentId) => {
      if (!director.upgradeMemory(agentId)) setFailureObjective("灵感不足，或这只蝌蚪的记忆已经扩满");
    },
    onScoutGate: attemptScoutGate,
    onRest: () => director.restSquad(),
    onChooseMother: (frogId) => director.chooseMother(frogId),
    onDemoEnding: (correct) => store.dispatch({
      type: "DEMO_ENDING",
      frogId: correct ? demoCase.motherId : "tree-frog",
      correct,
    }),
    onRestart: () => {
      director.reset();
      world.reset();
      hud.closeModal();
    },
  });

  const unsubscribe = store.subscribe((state) => {
    hud.render(state);
    agentOrder.forEach((agentId) => views.agents[agentId].setSelected(state.selectedAgentIds.includes(agentId)));
    Object.values(views.frogs).forEach((view) => { view.group.visible = state.candidateFrogsRevealed; });
    options.canvas.dataset.gamePhase = state.phase;
    options.canvas.dataset.gameRegion = state.currentRegionId;
    options.canvas.dataset.gameInspiration = String(state.inspiration);
    options.canvas.dataset.gameSelectedAgent = state.selectedAgentIds.join(",");
    options.canvas.dataset.gameNearbyNpc = state.nearbyNpcId ?? "";
    options.canvas.dataset.gameNearbyFrog = state.nearbyFrogId ?? "";
    options.canvas.dataset.gameCandidateFrogs = state.candidateFrogsRevealed ? "revealed" : "hidden";
    options.canvas.dataset.gameNearbyObstacle = state.nearbyObstacleId ?? "";
    options.canvas.dataset.gameMemoryCounts = agentOrder.map((id) => state.agents[id].memories.filter(Boolean).length).join(",");
    options.canvas.dataset.gameAgentModes = agentOrder.map((id) => state.agents[id].mode).join(",");
    options.canvas.dataset.gameJump = agentOrder.map((id) => state.agents[id].jumpKnowledge).join(",");
  });

  const input = createInputController({
    root: options.root,
    onAgentShortcut(index) { selectAgent(agentOrder[index]); },
    onRecall() {
      const selected = store.getState().selectedAgentId;
      if (selected) director.recall(selected);
    },
    onWhistle() {
      if (!gameStarted) return;
      const recalled = world.whistle(7.5);
      store.dispatch({ type: "SET_OBJECTIVE", objective: recalled > 0 ? `口哨响起，${recalled} 只蝌蚪正在回到身边` : "口哨响起，附近没有需要召回的蝌蚪" });
    },
    onToggleEvidence: () => hud.toggleEvidence(),
    onToggleMemory: () => hud.toggleMemory(),
    onEscape: () => hud.closeModal(),
  });

  const selectionBox = options.root.querySelector<HTMLElement>("[data-selection-box]");
  if (!selectionBox) throw new Error("Missing selection box overlay.");
  let hoveredTarget: InteractiveTarget | null = null;

  const pointer = createPointerController({
    canvas: options.canvas,
    camera: host.cameraRig.camera,
    onSelect(target) {
      const state = store.getState();
      if (target.type === "agent") { selectAgent(target.id as AgentId); return; }
      if (target.type === "npc") {
        const id = target.id as NpcId;
        if (id === "dragonfly" && !state.scoutedGateIds.includes("dragonfly-gap")) {
          setFailureObjective("旅行蜻蜓在叶隙对岸，请先选择会跳跃的蝌蚪过去侦察");
          return;
        }
        if (!director.startConversation(state.selectedAgentIds, id)) {
          setFailureObjective("先选择空闲、没那么疲惫的蝌蚪再聊天");
        }
        return;
      }
      if (target.type === "frog") {
        const id = target.id as FrogId;
        if (!state.candidateFrogsRevealed) {
          setFailureObjective("继续核对不同来源的线索，候选妈妈还没有出现");
          return;
        }
        if (state.nearbyFrogId === id) hud.openMotherChoice(id);
        else setFailureObjective("先靠近这位青蛙，她现在听不见小队说话");
        return;
      }
      if (target.type === "obstacle") {
        const id = target.id as ObstacleId;
        if (state.nearbyObstacleId !== id) setFailureObjective("先带队靠近需要清理的东西");
        return;
      }
      if (target.type === "gate") {
        const id = target.id as GateId;
        if (state.nearbyGateId !== id) setFailureObjective("靠近荷叶通道再安排队伍");
        else if (id === "dragonfly-gap") attemptScoutGate(id);
        else setFailureObjective("莲叶长桥需要三只蝌蚪都掌握跳跃");
      }
    },
    onSelectAgents(agentIds) { selectAgents(agentIds as AgentId[]); },
    onHoverTarget(target) { hoveredTarget = target; },
    onBoxSelect(rect) {
      selectionBox.hidden = !rect;
      if (!rect) return;
      selectionBox.style.left = `${rect.left}px`;
      selectionBox.style.top = `${rect.top}px`;
      selectionBox.style.width = `${rect.width}px`;
      selectionBox.style.height = `${rect.height}px`;
    },
    onMoveTarget(point) { world.setNavigationTarget(point); },
  });
  agentOrder.forEach((id) => pointer.add(views.agents[id].group));
  demoCase.npcs.forEach((item) => pointer.add(views.npcs[item.id].group));
  demoCase.candidates.forEach((item) => pointer.add(views.frogs[item.id].group));
  demoCase.obstacles.forEach((item) => pointer.add(host.environment.obstacles[item.id]));
  demoCase.gates.forEach((item) => pointer.add(host.environment.gates[item.id]));

  const debugPanel = createDebugPanel({ root: options.root, onTeleport: (checkpoint) => world.teleport(checkpoint) });
  const movement = new THREE.Vector3();
  const overlayPosition = new THREE.Vector3();
  const frogIndicatorWorld = new THREE.Vector3();
  const frogIndicatorProjection = new THREE.Vector3();
  const frogIndicatorCameraSpace = new THREE.Vector3();

  function projectToHud(object: THREE.Object3D, height: number): { x: number; y: number } | null {
    const canvasRect = options.canvas.getBoundingClientRect();
    const rootRect = options.root.getBoundingClientRect();
    object.getWorldPosition(overlayPosition);
    overlayPosition.y += height;
    overlayPosition.project(host.cameraRig.camera);
    if (overlayPosition.z < -1 || overlayPosition.z > 1) return null;
    const x = canvasRect.left - rootRect.left + ((overlayPosition.x + 1) / 2) * canvasRect.width;
    const y = canvasRect.top - rootRect.top + ((1 - overlayPosition.y) / 2) * canvasRect.height;
    if (x < -80 || x > rootRect.width + 80 || y < -80 || y > rootRect.height + 80) return null;
    return { x, y };
  }

  function projectToFrogEdge(object: THREE.Object3D): { x: number; y: number; angle: number } | null {
    object.getWorldPosition(frogIndicatorWorld);
    if (frogIndicatorWorld.distanceTo(world.getPlayerPosition()) > 17.5) return null;

    frogIndicatorWorld.y += 0.75;
    frogIndicatorCameraSpace.copy(frogIndicatorWorld).applyMatrix4(host.cameraRig.camera.matrixWorldInverse);
    frogIndicatorProjection.copy(frogIndicatorWorld).project(host.cameraRig.camera);
    const behindCamera = frogIndicatorCameraSpace.z >= 0;
    const onScreen = !behindCamera
      && frogIndicatorProjection.z >= -1
      && frogIndicatorProjection.z <= 1
      && Math.abs(frogIndicatorProjection.x) <= 0.88
      && Math.abs(frogIndicatorProjection.y) <= 0.78;
    if (onScreen) return null;

    let directionX = frogIndicatorProjection.x;
    let directionY = -frogIndicatorProjection.y;
    if (behindCamera) {
      directionX *= -1;
      directionY *= -1;
    }
    if (!Number.isFinite(directionX) || !Number.isFinite(directionY) || Math.abs(directionX) + Math.abs(directionY) < 0.001) {
      directionX = 0;
      directionY = behindCamera ? 1 : -1;
    }

    const rootRect = options.root.getBoundingClientRect();
    const compact = rootRect.width <= 720;
    const sideInset = compact ? 27 : 38;
    const topInset = compact ? 92 : 86;
    const bottomInset = compact ? 176 : 88;
    const centerX = rootRect.width / 2;
    const centerY = (topInset + rootRect.height - bottomInset) / 2;
    const horizontalScale = directionX > 0
      ? (rootRect.width - sideInset - centerX) / directionX
      : directionX < 0 ? (sideInset - centerX) / directionX : Number.POSITIVE_INFINITY;
    const verticalScale = directionY > 0
      ? (rootRect.height - bottomInset - centerY) / directionY
      : directionY < 0 ? (topInset - centerY) / directionY : Number.POSITIVE_INFINITY;
    const scale = Math.min(horizontalScale, verticalScale);

    return {
      x: centerX + directionX * scale,
      y: centerY + directionY * scale,
      angle: Math.atan2(directionY, directionX) * (180 / Math.PI) + 90,
    };
  }

  function updateWorldOverlays(): void {
    const state = store.getState();
    const selectedIds = state.selectedAgentIds.filter((id) => state.agents[id].mode === "following" && state.agents[id].fatigue < 90);
    const bubbles: Array<WorldOverlays["bubbles"][number]> = [];
    if (selectedIds.length > 0 && hoveredTarget?.type === "npc") {
      const id = hoveredTarget.id as NpcId;
      const screen = projectToHud(views.npcs[id].group, 1.65);
      if (screen) bubbles.push({ targetType: "npc", targetId: id, label: "聊一聊", detail: `${selectedIds.length} 只蝌蚪`, ...screen });
    }
    if (selectedIds.length > 0 && hoveredTarget?.type === "obstacle" && state.nearbyObstacleId === hoveredTarget.id) {
      const id = hoveredTarget.id as ObstacleId;
      const obstacle = demoCase.obstacles.find((candidate) => candidate.id === id)!;
      const screen = projectToHud(host.environment.obstacles[id], 1.35);
      if (screen) bubbles.push({ targetType: "obstacle", targetId: id, label: "开始清理", detail: `+${obstacle.reward} 灵感`, ...screen });
    }
    if (hoveredTarget?.type === "gate" && hoveredTarget.id === "dragonfly-gap" && state.nearbyGateId === "dragonfly-gap" && !state.scoutedGateIds.includes("dragonfly-gap")) {
      const screen = projectToHud(host.environment.gates["dragonfly-gap"], 1.5);
      const selected = state.selectedAgentIds.length === 1 && state.selectedAgentId ? state.agents[state.selectedAgentId] : undefined;
      if (screen) bubbles.push({
        targetType: "gate",
        targetId: "dragonfly-gap",
        label: selected?.jumpKnowledge === "learned" ? `让${selected.name}跳过去` : "越过叶隙",
        detail: selected ? (selected.jumpKnowledge === "learned" ? "侦察并带回信息" : "尚未掌握跳跃") : "先选一只蝌蚪",
        ...screen,
      });
    }
    const progress = agentOrder.flatMap((agentId) => {
      const task = director.getTaskProgress(agentId);
      const screen = task ? projectToHud(views.agents[agentId].group, 1.45) : null;
      return task && screen ? [{ agentId, label: task.label, value: task.value, ...screen }] : [];
    });
    const utterances = agentOrder.flatMap((agentId) => {
      const utterance = state.agents[agentId].utterance;
      const screen = utterance && utterance.expiresAt > Date.now() ? projectToHud(views.agents[agentId].group, 1.8) : null;
      return utterance && screen ? [{ agentId, text: utterance.text, kind: utterance.kind, ...screen }] : [];
    });
    const frogIndicators = state.candidateFrogsRevealed && state.phase === "explore"
      ? demoCase.candidates.flatMap((candidate) => {
        const screen = projectToFrogEdge(views.frogs[candidate.id].group);
        const label = state.generatedCast?.frogs[candidate.id]?.name ?? candidate.name;
        return screen ? [{ frogId: candidate.id, label: `${label}在这个方向`, ...screen }] : [];
      })
      : [];
    hud.renderWorldOverlays({ bubbles, progress, utterances, frogIndicators });
  }
  const onResize = (): void => host.resize();
  const loop = createGameLoop(host.renderer, (delta, elapsed) => {
    if (!gameStarted) {
      host.render(elapsed);
      return;
    }
    input.movement(movement);
    world.update(delta, elapsed, movement);
    director.update(delta);
    host.cameraRig.update(delta, world.getPlayerPosition(), world.getMovementDirection());
    updateWorldOverlays();
    const hoveredNpcId = hoveredTarget?.type === "npc" ? hoveredTarget.id : undefined;
    Object.entries(views.npcs).forEach(([id, view]) => view.setHighlighted(id === hoveredNpcId || id === store.getState().nearbyNpcId));
    host.render(elapsed);
  });

  window.addEventListener("resize", onResize);
  host.resize();
  host.cameraRig.update(1, world.getPlayerPosition(), world.getMovementDirection());

  const debugWindow = window as Window & { __WHO_IS_MOM_DEBUG__?: { snapshot(): unknown } };
  if (import.meta.env.DEV) {
    debugWindow.__WHO_IS_MOM_DEBUG__ = {
      snapshot: () => ({ pixels: host.getPixelDiagnostics(), player: world.getPlayerPosition().toArray(), state: store.getState() }),
    };
  }

  return {
    start() { loop.start(); },
    dispose() {
      loop.stop();
      window.removeEventListener("resize", onResize);
      pointer.dispose();
      input.dispose();
      debugPanel.dispose();
      unsubscribe();
      hud.dispose();
      delete debugWindow.__WHO_IS_MOM_DEBUG__;
      host.dispose();
    },
  };
}
