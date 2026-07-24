import * as THREE from "three";
import type { AgentId, NpcId } from "../core/types";
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

export function createGameApp(options: {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
}): GameApp {
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
      const [x, y, z] = definition.position;
      view.group.position.set(x, y, z);
      npcPositions[definition.id] = view.group.position;
      host.worldRoot.add(view.group);
      return [definition.id, view];
    }),
  ) as ViewRegistry["npcs"];

  const frogs = Object.fromEntries(
    demoCase.candidates.map((definition) => {
      const view = createFrog(definition, host.palette);
      const [x, y, z] = definition.position;
      view.group.position.set(x, y, z);
      view.group.rotation.y = Math.PI;
      host.worldRoot.add(view.group);
      return [definition.id, view];
    }),
  ) as ViewRegistry["frogs"];

  const views: ViewRegistry = { player, agents, npcs, frogs };
  const world = createWorldBridge({ store, director, views, npcPositions });
  world.reset();

  const selectAgent = (agentId?: AgentId): void => {
    store.dispatch({ type: "SELECT_AGENT", agentId });
  };
  const recallSelected = (): void => {
    const selected = store.getState().selectedAgentId;
    if (selected) director.recall(selected);
  };

  const hud = createHud({
    root: options.root,
    onSelect: selectAgent,
    onRecall: (agentId) => director.recall(agentId),
    onInvestigate: (agentId, npcId, topic) => {
      if (!director.startInvestigation(agentId, npcId, topic)) {
        store.dispatch({ type: "SET_OBJECTIVE", objective: "这只蝌蚪现在无法开始调查" });
      }
    },
    onDiscuss: (firstId, secondId, topic) => {
      if (!director.startDiscussion(firstId, secondId, topic)) {
        store.dispatch({ type: "SET_OBJECTIVE", objective: "它们还没有能互相核对的同类记忆" });
      }
    },
    onChooseMother: (frogId) => director.chooseMother(frogId),
    onRestart: () => {
      director.reset();
      world.reset();
      hud.closeModal();
    },
  });

  const unsubscribe = store.subscribe((state) => {
    hud.render(state);
    agentOrder.forEach((agentId) => {
      views.agents[agentId].setSelected(state.selectedAgentId === agentId);
    });
    options.canvas.dataset.gamePhase = state.phase;
    options.canvas.dataset.gameActions = String(state.actionsLeft);
    options.canvas.dataset.gameSelectedAgent = state.selectedAgentId ?? "";
    options.canvas.dataset.gameNearbyNpc = state.nearbyNpcId ?? "";
    options.canvas.dataset.gameAtPond = String(state.atPond);
    options.canvas.dataset.gameMemoryCounts = agentOrder
      .map((agentId) => state.agents[agentId].memories.filter(Boolean).length)
      .join(",");
    options.canvas.dataset.gameAgentModes = agentOrder
      .map((agentId) => state.agents[agentId].mode)
      .join(",");
  });

  const input = createInputController({
    root: options.root,
    onAgentShortcut(index) {
      selectAgent(agentOrder[index]);
    },
    onRecall: recallSelected,
    onToggleDetails: () => hud.toggleDetails(),
    onEscape: () => hud.closeModal(),
  });

  const pointer = createPointerController({
    canvas: options.canvas,
    camera: host.cameraRig.camera,
    onSelect(target) {
      const state = store.getState();
      if (target.type === "agent") {
        selectAgent(target.id as AgentId);
        return;
      }
      if (target.type === "npc") {
        const npcId = target.id as NpcId;
        const npc = demoCase.npcs.find((candidate) => candidate.id === npcId)!;
        if (state.nearbyNpcId !== npcId) {
          store.dispatch({ type: "SET_OBJECTIVE", objective: `先游近一些，再调查${npc.name}` });
        } else if (!state.selectedAgentId) {
          store.dispatch({ type: "SET_OBJECTIVE", objective: `先选择一只蝌蚪，再调查${npc.name}` });
        } else {
          hud.openInvestigation();
        }
        return;
      }
      if (target.type === "frog") {
        if (state.atPond) hud.openMotherChoice();
        else store.dispatch({ type: "SET_OBJECTIVE", objective: "继续沿河前进，去月牙荷塘观察候选妈妈" });
      }
    },
    onMoveTarget(point) {
      world.setNavigationTarget(point);
    },
  });
  agentOrder.forEach((agentId) => pointer.add(views.agents[agentId].group));
  demoCase.npcs.forEach((npc) => pointer.add(views.npcs[npc.id].group));
  demoCase.candidates.forEach((frog) => pointer.add(views.frogs[frog.id].group));

  const debugPanel = createDebugPanel({
    root: options.root,
    onTeleport: (checkpoint) => world.teleport(checkpoint),
  });

  const movement = new THREE.Vector3();
  const onResize = (): void => host.resize();
  const loop = createGameLoop(host.renderer, (delta, elapsed) => {
    input.movement(movement);
    world.update(delta, elapsed, movement);
    director.update(delta);
    host.cameraRig.update(delta, world.getPlayerPosition());
    host.render(elapsed);
  });

  window.addEventListener("resize", onResize);
  host.resize();
  host.cameraRig.update(1, world.getPlayerPosition());

  const debugWindow = window as Window & {
    __WHO_IS_MOM_DEBUG__?: { snapshot(): unknown };
  };
  if (import.meta.env.DEV) {
    debugWindow.__WHO_IS_MOM_DEBUG__ = {
      snapshot: () => ({
        pixels: host.getPixelDiagnostics(),
        player: world.getPlayerPosition().toArray(),
        state: store.getState(),
      }),
    };
  }

  return {
    start() {
      loop.start();
    },
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
