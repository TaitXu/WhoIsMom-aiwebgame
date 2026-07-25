import type { AgentId, AgentMode, FrogId, GameState, GateId, Memory, NpcId, ObstacleId, Topic } from "../core/types";
import { agentMarkerColors, personalityLabels } from "../game/agents/personality";
import { demoCase } from "../game/case/demoCase";
import { confirmedSourceCount, memoryUpgradeCost } from "../game/state/gameRules";

export interface Hud {
  render(state: Readonly<GameState>): void;
  toggleDetails(): void;
  openInvestigation(npcId?: NpcId): void;
  openCleanup(obstacleId?: ObstacleId): void;
  openMotherChoice(frogId?: FrogId): void;
  closeModal(): void;
  dispose(): void;
}

type ModalState =
  | { type: "investigate"; npcId: NpcId; agentIds: AgentId[]; topic: Topic }
  | { type: "cleanup"; obstacleId: ObstacleId; agentIds: AgentId[] }
  | { type: "discussion"; firstId: AgentId; secondId: AgentId; topic: Topic }
  | { type: "mother"; frogId: FrogId }
  | null;

const agentOrder: AgentId[] = ["modian", "xiaolang", "paopao"];
const discussionTopics: Topic[] = ["appearance", "location", "source", "jump"];
const modeLabels: Record<AgentMode, string> = {
  following: "跟随",
  considering: "犹豫",
  approaching: "前往任务",
  interacting: "交谈中",
  working: "清理中",
  teaching: "教学中",
  jumping: "跳跃中",
  returning: "返回中",
  discussing: "对证中",
  tired: "疲惫",
};
const topicLabels: Record<Topic, string> = {
  appearance: "外貌",
  location: "地点",
  source: "来源",
  jump: "跳跃",
};
const topicHints: Record<Topic, string> = {
  appearance: "它看起来是什么样？",
  location: "它在哪里出现？",
  source: "这条消息从哪里来？",
  jump: "怎样借荷叶的弹力起跳？",
};

export function createHud(options: {
  root: HTMLElement;
  onSelect(agentId: AgentId): void;
  onRecall(agentId: AgentId): void;
  onInvestigate(agentIds: AgentId[], npcId: NpcId, topic: Topic): void;
  onCleanup(agentIds: AgentId[], obstacleId: ObstacleId): void;
  onDiscuss(firstId: AgentId, secondId: AgentId, topic: Topic): void;
  onTeachJump(teacherId: AgentId, studentId: AgentId): void;
  onUpgradeMemory(agentId: AgentId): void;
  onScoutGate(gateId: GateId): void;
  onRest(): void;
  onChooseMother(frogId: FrogId): void;
  onRestart(): void;
}): Hud {
  const squad = requireElement<HTMLElement>(options.root, "[data-squad]");
  const objective = requireElement<HTMLElement>(options.root, "[data-objective]");
  const region = requireElement<HTMLElement>(options.root, "[data-region]");
  const inspiration = requireElement<HTMLElement>(options.root, "[data-inspiration]");
  const evidence = requireElement<HTMLElement>(options.root, "[data-evidence]");
  const minimap = requireElement<HTMLElement>(options.root, "[data-minimap]");
  const selectionLabel = requireElement<HTMLElement>(options.root, "[data-selection-label]");
  const selectionHint = requireElement<HTMLElement>(options.root, "[data-selection-hint]");
  const detailsButton = requireElement<HTMLButtonElement>(options.root, '[data-action="toggle-details"]');
  const recallButton = requireElement<HTMLButtonElement>(options.root, '[data-action="recall"]');
  const prompt = requireElement<HTMLElement>(options.root, "[data-interaction-prompt]");
  const drawer = requireElement<HTMLElement>(options.root, "[data-agent-drawer]");
  const drawerName = requireElement<HTMLElement>(options.root, "[data-drawer-name]");
  const drawerPersonality = requireElement<HTMLElement>(options.root, "[data-drawer-personality]");
  const meters = requireElement<HTMLElement>(options.root, "[data-agent-meters]");
  const memoryList = requireElement<HTMLElement>(options.root, "[data-memory-list]");
  const drawerActions = requireElement<HTMLElement>(options.root, "[data-drawer-actions]");
  const modalLayer = requireElement<HTMLElement>(options.root, "[data-modal-layer]");
  const modalContent = requireElement<HTMLElement>(options.root, "[data-modal-content]");
  const ending = requireElement<HTMLElement>(options.root, "[data-ending]");

  const cards = new Map<AgentId, HTMLButtonElement>();
  let lastState: Readonly<GameState> | null = null;
  let drawerOpen = false;
  let modalState: ModalState = null;

  agentOrder.forEach((agentId, index) => {
    const button = element("button", "squad-member") as HTMLButtonElement;
    button.type = "button";
    button.dataset.agentId = agentId;
    button.style.setProperty("--agent-color", colorHex(agentMarkerColors[agentId]));
    const heading = element("span", "squad-member__heading");
    heading.append(element("strong", "squad-member__name"), element("kbd", "squad-member__shortcut", String(index + 1)));
    button.append(heading, element("span", "squad-member__mode"), element("span", "memory-pips"), element("span", "fatigue-mini"));
    squad.append(button);
    cards.set(agentId, button);
  });

  demoCase.regions.forEach((definition) => {
    const cell = element("span", "map-cell");
    cell.dataset.regionId = definition.id;
    cell.title = definition.name;
    minimap.append(cell);
  });

  const onRootClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!target) return;
    const agentId = target.dataset.agentId as AgentId | undefined;
    if (agentId && target.classList.contains("squad-member")) {
      if (lastState?.selectedAgentId === agentId) drawerOpen = !drawerOpen;
      else options.onSelect(agentId);
      renderCurrent();
      return;
    }

    const action = target.dataset.action;
    if (action === "toggle-details") toggleDetails();
    if (action === "close-drawer") { drawerOpen = false; renderCurrent(); }
    if (action === "recall" && lastState?.selectedAgentId) options.onRecall(lastState.selectedAgentId);
    if (action === "investigate-nearby") openInvestigation();
    if (action === "cleanup-nearby") openCleanup();
    if (action === "talk-mother") openMotherChoice();
    if (action === "open-discussion") openDiscussion();
    if (action === "upgrade-memory" && lastState?.selectedAgentId) options.onUpgradeMemory(lastState.selectedAgentId);
    if (action === "teach-jump" && lastState?.selectedAgentId) options.onTeachJump(lastState.selectedAgentId, target.dataset.studentId as AgentId);
    if (action === "scout-gate") options.onScoutGate("dragonfly-gap");
    if (action === "rest") options.onRest();
    if (action === "modal-close") closeModal();
    if (action === "restart") options.onRestart();

    if (action === "modal-agent-toggle" && modalState && (modalState.type === "investigate" || modalState.type === "cleanup")) {
      const id = target.dataset.agentId as AgentId;
      const max = modalState.type === "investigate" ? 3 : 2;
      const exists = modalState.agentIds.includes(id);
      modalState = { ...modalState, agentIds: exists ? modalState.agentIds.filter((candidate) => candidate !== id) : modalState.agentIds.length < max ? [...modalState.agentIds, id] : modalState.agentIds };
      renderModal();
    }
    if (action === "investigation-topic" && modalState?.type === "investigate") {
      modalState = { ...modalState, topic: target.dataset.topic as Topic };
      renderModal();
    }
    if (action === "investigation-confirm" && modalState?.type === "investigate") {
      const current = modalState;
      closeModal();
      options.onInvestigate(current.agentIds, current.npcId, current.topic);
    }
    if (action === "cleanup-confirm" && modalState?.type === "cleanup") {
      const current = modalState;
      closeModal();
      options.onCleanup(current.agentIds, current.obstacleId);
    }
    if (action === "discussion-agent" && modalState?.type === "discussion") {
      const secondId = target.dataset.agentId as AgentId;
      const available = commonTopics(lastState!, modalState.firstId, secondId);
      modalState = { ...modalState, secondId, topic: available.includes(modalState.topic) ? modalState.topic : available[0] ?? "appearance" };
      renderModal();
    }
    if (action === "discussion-topic" && modalState?.type === "discussion") {
      modalState = { ...modalState, topic: target.dataset.topic as Topic };
      renderModal();
    }
    if (action === "discussion-confirm" && modalState?.type === "discussion") {
      const current = modalState;
      closeModal();
      options.onDiscuss(current.firstId, current.secondId, current.topic);
    }
    if (action === "choose-mother" && modalState?.type === "mother") {
      const frogId = modalState.frogId;
      closeModal();
      options.onChooseMother(frogId);
    }
  };

  const onBackdropClick = (event: MouseEvent): void => {
    if (event.target === modalLayer) closeModal();
  };
  options.root.addEventListener("click", onRootClick);
  modalLayer.addEventListener("click", onBackdropClick);

  function render(state: Readonly<GameState>): void {
    lastState = state;
    objective.textContent = state.objective;
    const regionDefinition = demoCase.regions.find((candidate) => candidate.id === state.currentRegionId)!;
    region.textContent = regionDefinition.name;
    inspiration.textContent = String(state.inspiration);
    evidence.textContent = `${confirmedSourceCount(state)}/2`;
    renderMap(state);
    agentOrder.forEach((id) => renderSquadMember(cards.get(id)!, state, id));
    const selected = state.selectedAgentId ? state.agents[state.selectedAgentId] : undefined;
    selectionLabel.textContent = selected ? `已选择 ${selected.name}` : "尚未选择蝌蚪";
    selectionHint.textContent = selected ? `${personalityLabels[selected.personality]} · ${modeLabels[selected.mode]}` : "点击队伍色块，或按 1-3";
    detailsButton.disabled = !selected;
    recallButton.disabled = !selected?.activeTask;
    renderPrompt(state, selected?.id);
    renderDrawer(state, selected?.id);
    renderEnding(state);
    if (modalState) renderModal();
  }

  function renderMap(state: Readonly<GameState>): void {
    minimap.querySelectorAll<HTMLElement>(".map-cell").forEach((cell) => {
      const id = cell.dataset.regionId!;
      cell.classList.toggle("is-discovered", state.discoveredRegionIds.includes(id as GameState["currentRegionId"]));
      cell.classList.toggle("is-current", id === state.currentRegionId);
      const definition = demoCase.regions.find((candidate) => candidate.id === id)!;
      const entityCount = [
        ...demoCase.npcs.filter((item) => item.regionId === id),
        ...demoCase.candidates.filter((item) => item.regionId === id),
        ...demoCase.obstacles.filter((item) => item.regionId === id && !state.clearedObstacleIds.includes(item.id)),
      ].filter((item) => state.discoveredEntityIds.includes(item.id)).length;
      cell.dataset.entities = entityCount > 0 ? String(entityCount) : "";
      cell.style.setProperty("--region-accent", colorHex(definition.accentColor));
    });
  }

  function renderPrompt(state: Readonly<GameState>, selectedId?: AgentId): void {
    prompt.replaceChildren();
    if (state.phase === "ending") { prompt.hidden = true; return; }
    if (state.nearbyNpcId) {
      const npc = demoCase.npcs.find((candidate) => candidate.id === state.nearbyNpcId)!;
      prompt.append(element("span", "prompt-copy", `${npc.name} · ${npc.role}`), actionButton("调查", "investigate-nearby", "text-button text-button--cyan"));
    } else if (state.nearbyObstacleId) {
      const obstacle = demoCase.obstacles.find((candidate) => candidate.id === state.nearbyObstacleId)!;
      prompt.append(element("span", "prompt-copy", `${obstacle.name} · 清理可得 ${obstacle.reward} 灵感`), actionButton("分配清理", "cleanup-nearby", "text-button text-button--yellow"));
    } else if (state.nearbyFrogId) {
      const frog = demoCase.candidates.find((candidate) => candidate.id === state.nearbyFrogId)!;
      prompt.append(element("span", "prompt-copy", `${frog.name}正在这里休息`), actionButton("交谈", "talk-mother", "text-button text-button--pink"));
    } else if (state.nearbyGateId === "dragonfly-gap") {
      const learned = agentOrder.some((id) => state.agents[id].jumpKnowledge === "learned");
      prompt.append(element("span", "prompt-copy", learned ? "会跳跃的蝌蚪可以独自越过叶隙" : "先去春草岸学习跳跃"));
      if (learned && !state.scoutedGateIds.includes("dragonfly-gap")) prompt.append(actionButton("派去侦察", "scout-gate", "text-button text-button--pink"));
    } else if (state.nearbyGateId === "lotus-gate") {
      const learnedCount = agentOrder.filter((id) => state.agents[id].jumpKnowledge === "learned").length;
      prompt.append(element("span", "prompt-copy", learnedCount === 3 ? "三只蝌蚪都准备好了，长桥已经畅通" : `跳跃掌握 ${learnedCount}/3`));
    } else if (state.atRestSpot) {
      prompt.append(element("span", "prompt-copy", "孵化静池能让疲惫的小队安定下来"), actionButton("休息", "rest", "text-button text-button--green"));
    } else {
      prompt.hidden = true;
      return;
    }
    prompt.hidden = false;
    void selectedId;
  }

  function renderDrawer(state: Readonly<GameState>, selectedId?: AgentId): void {
    const agent = selectedId ? state.agents[selectedId] : undefined;
    drawer.hidden = !drawerOpen || !agent || state.phase === "ending";
    if (!agent) return;
    drawerName.textContent = agent.name;
    drawerPersonality.textContent = `${personalityLabels[agent.personality]}型 Agent`;
    meters.replaceChildren(
      meter("疲劳", `${agent.fatigue}%`, agent.fatigue, agent.fatigue >= 70 ? "coral" : "green"),
      meter("跳跃", jumpLabel(agent.jumpKnowledge), agent.jumpKnowledge === "learned" ? 100 : agent.jumpKnowledge === "partial" ? 50 : 0, "cyan"),
    );
    memoryList.replaceChildren();
    agent.memories.slice(0, agent.memoryCapacity).forEach((memory, index) => memoryList.append(memoryRow(memory, index)));
    drawerActions.replaceChildren();
    const discuss = actionButton("安排对证", "open-discussion", "text-button text-button--cyan");
    discuss.disabled = !agent.memories.some(Boolean) || !agentOrder.some((id) => id !== agent.id && state.agents[id].memories.some(Boolean));
    drawerActions.append(discuss);
    const cost = memoryUpgradeCost(agent.memoryCapacity);
    if (cost > 0) {
      const upgrade = actionButton(`扩充记忆 · ${cost} 灵感`, "upgrade-memory", "text-button text-button--yellow");
      upgrade.disabled = state.inspiration < cost;
      drawerActions.append(upgrade);
    }
    if (agent.jumpKnowledge === "learned") {
      agentOrder.filter((id) => id !== agent.id && state.agents[id].jumpKnowledge !== "learned").forEach((studentId) => {
        const teach = actionButton(`教${state.agents[studentId].name}跳跃`, "teach-jump", "text-button text-button--pink");
        teach.dataset.studentId = studentId;
        teach.disabled = agent.mode !== "following" || state.agents[studentId].mode !== "following";
        drawerActions.append(teach);
      });
    }
  }

  function renderEnding(state: Readonly<GameState>): void {
    ending.hidden = state.phase !== "ending" || !state.ending;
    if (!state.ending) return;
    const selected = demoCase.candidates.find((candidate) => candidate.id === state.ending!.selectedMotherId)!;
    const correct = demoCase.candidates.find((candidate) => candidate.id === demoCase.motherId)!;
    ending.replaceChildren();
    const panel = element("div", "ending-panel");
    panel.append(
      element("span", "ending-kicker", state.ending.correct ? "找到妈妈" : "认错了"),
      element("h1", "ending-title", state.ending.correct ? `${correct.name}张开双臂` : `${selected.name}轻轻摇头`),
      element("p", "ending-copy", state.ending.correct ? "三只蝌蚪把沿途的记忆拼在一起，终于回到了妈妈身边。" : `真正的妈妈是${correct.name}。错误记忆没有说谎，只是缺少了地点或来源。`),
    );
    const timeline = element("ol", "evidence-timeline");
    state.evidenceLog.slice(-8).forEach((item) => {
      const row = element("li");
      row.append(element("span", "evidence-source", item.sourceLabel), element("strong", "", item.summary));
      timeline.append(row);
    });
    panel.append(timeline, actionButton("重新出发", "restart", "text-button text-button--green ending-restart"));
    ending.append(panel);
  }

  function openInvestigation(npcId = lastState?.nearbyNpcId): void {
    if (!lastState || !npcId) return;
    const npc = demoCase.npcs.find((candidate) => candidate.id === npcId)!;
    const available = agentOrder.filter((id) => lastState!.agents[id].mode === "following" && lastState!.agents[id].fatigue < 90);
    const initial = lastState.selectedAgentId && available.includes(lastState.selectedAgentId) ? [lastState.selectedAgentId] : available.slice(0, 1);
    modalState = { type: "investigate", npcId, agentIds: initial, topic: npc.topics[0] };
    renderModal();
  }

  function openCleanup(obstacleId = lastState?.nearbyObstacleId): void {
    if (!lastState || !obstacleId) return;
    const available = agentOrder.filter((id) => lastState!.agents[id].mode === "following" && lastState!.agents[id].fatigue < 90);
    const initial = lastState.selectedAgentId && available.includes(lastState.selectedAgentId) ? [lastState.selectedAgentId] : available.slice(0, 1);
    modalState = { type: "cleanup", obstacleId, agentIds: initial };
    renderModal();
  }

  function openDiscussion(): void {
    const state = lastState;
    const firstId = state?.selectedAgentId;
    if (!state || !firstId) return;
    const secondId = agentOrder.find((id) => id !== firstId && commonTopics(state, firstId, id).length > 0);
    if (!secondId) return;
    modalState = { type: "discussion", firstId, secondId, topic: commonTopics(state, firstId, secondId)[0]! };
    renderModal();
  }

  function openMotherChoice(frogId = lastState?.nearbyFrogId): void {
    if (!frogId) return;
    modalState = { type: "mother", frogId };
    renderModal();
  }

  function renderModal(): void {
    const state = lastState;
    if (!modalState || !state) { modalLayer.hidden = true; return; }
    modalLayer.hidden = false;
    modalContent.replaceChildren();
    const close = actionButton("×", "modal-close", "icon-button icon-button--plain modal-close");
    close.setAttribute("aria-label", "关闭");
    const header = element("header", "modal-header");
    const title = element("h2");
    title.id = "modal-title";
    header.append(title, close);
    modalContent.append(header);

    if (modalState.type === "investigate") {
      const current = modalState;
      const npc = demoCase.npcs.find((candidate) => candidate.id === current.npcId)!;
      title.textContent = `调查 ${npc.name}`;
      modalContent.append(element("p", "modal-intro", "选择 1-3 只蝌蚪。它们会分别理解同一段听不见的对话。"));
      modalContent.append(agentSegments(state, current.agentIds, 3));
      const topics = element("div", "choice-list");
      npc.topics.forEach((topic) => {
        const button = actionButton("", "investigation-topic", `choice-row${current.topic === topic ? " is-active" : ""}`);
        button.dataset.topic = topic;
        button.append(element("strong", "", topicLabels[topic]), element("span", "", topicHints[topic]));
        topics.append(button);
      });
      const confirm = actionButton(`派出 ${current.agentIds.length} 只蝌蚪`, "investigation-confirm", "text-button text-button--green modal-confirm");
      confirm.disabled = current.agentIds.length === 0;
      modalContent.append(topics, confirm);
    }

    if (modalState.type === "cleanup") {
      const current = modalState;
      const obstacle = demoCase.obstacles.find((candidate) => candidate.id === current.obstacleId)!;
      title.textContent = `清理 ${obstacle.name}`;
      modalContent.append(element("p", "modal-intro", `${obstacle.description}。可分配 1-2 只蝌蚪，合适性格或协作会更快。`));
      modalContent.append(agentSegments(state, current.agentIds, 2));
      const confirm = actionButton(`开始清理 · +${obstacle.reward} 灵感`, "cleanup-confirm", "text-button text-button--yellow modal-confirm");
      confirm.disabled = current.agentIds.length === 0;
      modalContent.append(confirm);
    }

    if (modalState.type === "discussion") {
      const current = modalState;
      const first = state.agents[current.firstId];
      title.textContent = `让${first.name}和同伴对证`;
      modalContent.append(element("p", "modal-intro", "选择另一只蝌蚪和议题。对证可能确认记忆，也可能暴露被遗漏的语境。"));
      const agents = element("div", "segment-group");
      agentOrder.filter((id) => id !== current.firstId && commonTopics(state, current.firstId, id).length > 0).forEach((id) => {
        const button = actionButton(state.agents[id].name, "discussion-agent", "segment-button");
        button.dataset.agentId = id;
        button.setAttribute("aria-pressed", String(id === current.secondId));
        agents.append(button);
      });
      const availableTopics = commonTopics(state, current.firstId, current.secondId);
      const topicGroup = element("div", "segment-group");
      discussionTopics.forEach((topic) => {
        const button = actionButton(topicLabels[topic], "discussion-topic", "segment-button");
        button.dataset.topic = topic;
        button.disabled = !availableTopics.includes(topic);
        button.setAttribute("aria-pressed", String(topic === current.topic));
        topicGroup.append(button);
      });
      const confirm = actionButton("开始对证", "discussion-confirm", "text-button text-button--green modal-confirm");
      confirm.disabled = !availableTopics.includes(current.topic);
      modalContent.append(agents, topicGroup, confirm);
    }

    if (modalState.type === "mother") {
      const current = modalState;
      const frog = demoCase.candidates.find((candidate) => candidate.id === current.frogId)!;
      const sourceCount = confirmedSourceCount(state);
      title.textContent = frog.name;
      modalContent.append(element("p", "mother-description", frog.description));
      if (sourceCount < 2) {
        modalContent.append(element("div", "mother-dialogue", "“你们一路辛苦了。再听听不同朋友怎么说吧，我不想让你们只凭第一印象决定。”"));
        modalContent.append(element("p", "modal-intro", `目前只有 ${sourceCount}/2 个独立来源完成对证。`));
      } else {
        modalContent.append(element("div", "mother-dialogue", "她安静地等待你们把证据和记忆放在一起。"));
        modalContent.append(actionButton("确认她是妈妈", "choose-mother", "text-button text-button--pink modal-confirm"));
      }
    }
  }

  function agentSegments(state: Readonly<GameState>, selectedIds: AgentId[], max: number): HTMLElement {
    const group = element("div", "agent-choice-grid");
    agentOrder.forEach((id) => {
      const agent = state.agents[id];
      const button = actionButton("", "modal-agent-toggle", "agent-choice");
      button.dataset.agentId = id;
      button.style.setProperty("--agent-color", colorHex(agentMarkerColors[id]));
      button.disabled = (agent.mode !== "following" || agent.fatigue >= 90) && !selectedIds.includes(id);
      button.setAttribute("aria-pressed", String(selectedIds.includes(id)));
      button.append(element("strong", "", agent.name), element("span", "", `${personalityLabels[agent.personality]} · 疲劳 ${agent.fatigue}%`));
      group.append(button);
    });
    group.dataset.limit = String(max);
    return group;
  }

  function toggleDetails(): void {
    if (!lastState?.selectedAgentId) return;
    drawerOpen = !drawerOpen;
    renderCurrent();
  }

  function closeModal(): void {
    modalState = null;
    modalLayer.hidden = true;
    modalContent.replaceChildren();
  }

  function renderCurrent(): void {
    if (lastState) render(lastState);
  }

  return {
    render,
    toggleDetails,
    openInvestigation,
    openCleanup,
    openMotherChoice,
    closeModal,
    dispose() {
      options.root.removeEventListener("click", onRootClick);
      modalLayer.removeEventListener("click", onBackdropClick);
    },
  };
}

function renderSquadMember(button: HTMLButtonElement, state: Readonly<GameState>, agentId: AgentId): void {
  const agent = state.agents[agentId];
  requireElement<HTMLElement>(button, ".squad-member__name").textContent = agent.name;
  requireElement<HTMLElement>(button, ".squad-member__mode").textContent = `${modeLabels[agent.mode]} · ${jumpLabel(agent.jumpKnowledge)}`;
  const pips = requireElement<HTMLElement>(button, ".memory-pips");
  pips.replaceChildren();
  agent.memories.slice(0, agent.memoryCapacity).forEach((memory) => {
    const pip = element("i", "memory-pip");
    pip.classList.toggle("has-memory", Boolean(memory));
    pip.classList.toggle("is-questioned", memory?.confidence === "questioned");
    pip.classList.toggle("is-confirmed", memory?.confidence === "confirmed");
    pips.append(pip);
  });
  const fatigue = requireElement<HTMLElement>(button, ".fatigue-mini");
  fatigue.style.setProperty("--fatigue", `${agent.fatigue}%`);
  button.classList.toggle("is-selected", state.selectedAgentId === agentId);
  button.classList.toggle("is-away", Boolean(agent.activeTask));
  button.classList.toggle("is-tired", agent.fatigue >= 70);
  button.setAttribute("aria-pressed", String(state.selectedAgentId === agentId));
  button.setAttribute("aria-label", `${agent.name} ${personalityLabels[agent.personality]} ${modeLabels[agent.mode]} ${agent.memories.filter(Boolean).length}条记忆`);
}

function memoryRow(memory: Memory | null, index: number): HTMLElement {
  const row = element("article", `memory-row${memory ? " has-memory" : ""}`);
  row.append(element("span", "memory-index", String(index + 1)));
  if (!memory) { row.append(element("span", "memory-empty", "空记忆槽")); return row; }
  const copy = element("div", "memory-copy");
  copy.append(element("strong", "", memory.summary), element("span", "", `${topicLabels[memory.topic]} · ${memory.rememberedSource} · ${confidenceLabel(memory.confidence)}`));
  row.append(copy);
  return row;
}

function commonTopics(state: Readonly<GameState>, firstId: AgentId, secondId: AgentId): Topic[] {
  if (!state.agents[firstId].memories.some(Boolean) || !state.agents[secondId].memories.some(Boolean)) return [];
  const firstTopics = new Set(state.agents[firstId].memories.flatMap((memory) => memory ? [memory.topic] : []));
  const secondTopics = new Set(state.agents[secondId].memories.flatMap((memory) => memory ? [memory.topic] : []));
  return discussionTopics.filter((topic) => firstTopics.has(topic) && secondTopics.has(topic));
}

function meter(label: string, value: string, progress: number, tone: string): HTMLElement {
  const block = element("div", `meter meter--${tone}`);
  const copy = element("span", "meter-copy");
  copy.append(element("span", "", label), element("strong", "", value));
  const track = element("i", "meter-track");
  track.style.setProperty("--progress", `${progress}%`);
  block.append(copy, track);
  return block;
}

function jumpLabel(value: GameState["agents"][AgentId]["jumpKnowledge"]): string {
  return value === "learned" ? "会跳跃" : value === "partial" ? "跳跃存疑" : "未学跳跃";
}

function confidenceLabel(confidence: Memory["confidence"]): string {
  return confidence === "questioned" ? "存疑" : confidence === "confirmed" ? "已印证" : "相信";
}

function actionButton(label: string, action: string, className = "text-button"): HTMLButtonElement {
  const button = element("button", className) as HTMLButtonElement;
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing HUD element: ${selector}`);
  return node;
}
