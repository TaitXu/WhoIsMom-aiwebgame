import * as THREE from "three";
import type { AgentId, FrogId, GateId, NpcId, ObstacleId } from "../core/types";
import { createAgentService } from "../ai/agentService";
import { createLocalAgentFallback } from "../ai/localAgentFallback";
import { createRemoteAgentAdapter } from "../ai/remoteAgentAdapter";
import { createDebugPanel } from "../diagnostics/createDebugPanel";
import { demoCase } from "../game/case/demoCase";
import { createGameDirector } from "../game/simulation/gameDirector";
import { createInitialGameState } from "../game/state/gameState";
import { createGameStore } from "../game/state/gameStore";
import { createInputController } from "../input/keyboardController";
import { createPointerController } from "../input/pointerController";
import { createFrog, createNpc, createPlayerFish, createTadpole } from "../render/characterFactory";
import { createRenderHost } from "../render/createRenderHost";
import { createWorldBridge } from "../render/adapters/worldBridge";
import type { ViewRegistry } from "../render/viewRegistry";
import { createHud } from "../ui/createHud";
import { createGameLoop } from "./gameLoop";

export interface GameApp {
  start(): void;
  dispose(): void;
}

const agentOrder: AgentId[] = ["modian", "xiaolang", "paopao"];

export function createGameApp(options: { root: HTMLElement; canvas: HTMLCanvasElement }): GameApp {
  const host = createRenderHost(options.canvas);
  const store = createGameStore(createInitialGameState());
  const service = createAgentService(createRemoteAgentAdapter(), createLocalAgentFallback());
  const director = createGameDirector({ store, service });

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
  const setFailureObjective = (message: string): void => store.dispatch({ type: "SET_OBJECTIVE", objective: message });

  const hud = createHud({
    root: options.root,
    onSelect: selectAgent,
    onRecall: (agentId) => director.recall(agentId),
    onInvestigate: (agentIds, npcId, topic) => {
      if (!director.startInvestigation(agentIds, npcId, topic)) setFailureObjective("这些蝌蚪现在无法一起开始调查");
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
    onScoutGate: (gateId) => {
      if (!director.scoutGate(gateId)) setFailureObjective("还没有空闲并真正掌握跳跃的蝌蚪");
    },
    onRest: () => director.restSquad(),
    onChooseMother: (frogId) => director.chooseMother(frogId),
    onRestart: () => {
      director.reset();
      world.reset();
      hud.closeModal();
    },
  });

  const unsubscribe = store.subscribe((state) => {
    hud.render(state);
    agentOrder.forEach((agentId) => views.agents[agentId].setSelected(state.selectedAgentId === agentId));
    options.canvas.dataset.gamePhase = state.phase;
    options.canvas.dataset.gameRegion = state.currentRegionId;
    options.canvas.dataset.gameInspiration = String(state.inspiration);
    options.canvas.dataset.gameSelectedAgent = state.selectedAgentId ?? "";
    options.canvas.dataset.gameNearbyNpc = state.nearbyNpcId ?? "";
    options.canvas.dataset.gameNearbyFrog = state.nearbyFrogId ?? "";
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
    onToggleDetails: () => hud.toggleDetails(),
    onEscape: () => hud.closeModal(),
  });

  const pointer = createPointerController({
    canvas: options.canvas,
    camera: host.cameraRig.camera,
    onSelect(target) {
      const state = store.getState();
      if (target.type === "agent") { selectAgent(target.id as AgentId); return; }
      if (target.type === "npc") {
        const id = target.id as NpcId;
        if (state.nearbyNpcId === id) hud.openInvestigation(id);
        else setFailureObjective(`先游近一些，再让蝌蚪调查${demoCase.npcs.find((item) => item.id === id)!.name}`);
        return;
      }
      if (target.type === "frog") {
        const id = target.id as FrogId;
        if (state.nearbyFrogId === id) hud.openMotherChoice(id);
        else setFailureObjective("先靠近这位青蛙，她现在听不见小队说话");
        return;
      }
      if (target.type === "obstacle") {
        const id = target.id as ObstacleId;
        if (state.nearbyObstacleId === id) hud.openCleanup(id);
        else setFailureObjective("先带队靠近需要清理的东西");
        return;
      }
      if (target.type === "gate") {
        const id = target.id as GateId;
        if (state.nearbyGateId !== id) setFailureObjective("靠近荷叶通道再安排队伍");
        else if (id === "dragonfly-gap") director.scoutGate(id);
        else setFailureObjective("莲叶长桥需要三只蝌蚪都掌握跳跃");
      }
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
  const onResize = (): void => host.resize();
  const loop = createGameLoop(host.renderer, (delta, elapsed) => {
    input.movement(movement);
    world.update(delta, elapsed, movement);
    director.update(delta);
    host.cameraRig.update(delta, world.getPlayerPosition(), world.getMovementDirection());
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
