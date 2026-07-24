import type {
  AgentId,
  AgentMode,
  FrogId,
  GameState,
  Memory,
  NpcId,
  Topic,
} from "../core/types";
import { agentMarkerColors, personalityLabels } from "../game/agents/personality";
import { demoCase } from "../game/case/demoCase";

export interface Hud {
  render(state: Readonly<GameState>): void;
  toggleDetails(): void;
  openInvestigation(): void;
  openMotherChoice(): void;
  closeModal(): void;
  dispose(): void;
}

type ModalState =
  | { type: "investigate"; agentId: AgentId; npcId: NpcId }
  | { type: "discussion"; firstId: AgentId; secondId: AgentId; topic: Topic }
  | { type: "mother" }
  | null;

const agentOrder: AgentId[] = ["modian", "xiaolang", "paopao"];
const topics: Topic[] = ["appearance", "location", "source"];
const modeLabels: Record<AgentMode, string> = {
  following: "跟随",
  considering: "犹豫",
  approaching: "离队中",
  interacting: "交谈中",
  returning: "返回中",
  discussing: "对证中",
};
const topicLabels: Record<Topic, string> = {
  appearance: "外貌",
  location: "地点",
  source: "来源",
};
const topicHints: Record<Topic, string> = {
  appearance: "它看起来是什么样？",
  location: "它在哪里出现？",
  source: "这条消息从哪里来？",
};

export function createHud(options: {
  root: HTMLElement;
  onSelect(agentId: AgentId): void;
  onRecall(agentId: AgentId): void;
  onInvestigate(agentId: AgentId, npcId: NpcId, topic: Topic): void;
  onDiscuss(firstId: AgentId, secondId: AgentId, topic: Topic): void;
  onChooseMother(frogId: FrogId): void;
  onRestart(): void;
}): Hud {
  const squad = requireElement<HTMLElement>(options.root, "[data-squad]");
  const objective = requireElement<HTMLElement>(options.root, "[data-objective]");
  const actions = requireElement<HTMLElement>(options.root, "[data-actions]");
  const phase = requireElement<HTMLElement>(options.root, "[data-phase]");
  const selectionLabel = requireElement<HTMLElement>(options.root, "[data-selection-label]");
  const selectionHint = requireElement<HTMLElement>(options.root, "[data-selection-hint]");
  const detailsButton = requireElement<HTMLButtonElement>(options.root, '[data-action="toggle-details"]');
  const recallButton = requireElement<HTMLButtonElement>(options.root, '[data-action="recall"]');
  const prompt = requireElement<HTMLElement>(options.root, "[data-interaction-prompt]");
  const drawer = requireElement<HTMLElement>(options.root, "[data-agent-drawer]");
  const drawerName = requireElement<HTMLElement>(options.root, "[data-drawer-name]");
  const drawerPersonality = requireElement<HTMLElement>(options.root, "[data-drawer-personality]");
  const drawerStatus = requireElement<HTMLElement>(options.root, "[data-drawer-status]");
  const memoryList = requireElement<HTMLElement>(options.root, "[data-memory-list]");
  const modalLayer = requireElement<HTMLElement>(options.root, "[data-modal-layer]");
  const modalContent = requireElement<HTMLElement>(options.root, "[data-modal-content]");
  const ending = requireElement<HTMLElement>(options.root, "[data-ending]");

  const cards = new Map<AgentId, HTMLButtonElement>();
  let lastState: Readonly<GameState> | null = null;
  let drawerOpen = false;
  let modalState: ModalState = null;

  agentOrder.forEach((agentId, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "squad-member";
    button.dataset.agentId = agentId;
    button.style.setProperty(
      "--agent-color",
      `#${agentMarkerColors[agentId].toString(16).padStart(6, "0")}`,
    );
    const marker = element("span", "squad-member__marker");
    const copy = element("span", "squad-member__copy");
    const name = element("strong", "squad-member__name");
    const mode = element("span", "squad-member__mode");
    copy.append(name, mode);
    const pips = element("span", "memory-pips");
    pips.append(...[0, 1, 2].map(() => element("i", "memory-pip")));
    const shortcut = element("kbd", "squad-member__shortcut", String(index + 1));
    button.append(marker, copy, pips, shortcut);
    squad.append(button);
    cards.set(agentId, button);
  });

  const onRootClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button");
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
    if (action === "close-drawer") {
      drawerOpen = false;
      renderCurrent();
    }
    if (action === "recall" && lastState?.selectedAgentId) {
      options.onRecall(lastState.selectedAgentId);
    }
    if (action === "investigate-nearby") openInvestigation();
    if (action === "open-discussion") openDiscussion();
    if (action === "open-mothers") openMotherChoice();
    if (action === "modal-close") closeModal();
    if (action === "restart") options.onRestart();

    if (action === "investigate") {
      const agent = target.dataset.agentId as AgentId;
      const npc = target.dataset.npcId as NpcId;
      const topic = target.dataset.topic as Topic;
      closeModal();
      options.onInvestigate(agent, npc, topic);
    }
    if (action === "discussion-agent" && modalState?.type === "discussion") {
      const secondId = target.dataset.agentId as AgentId;
      const available = commonTopics(lastState!, modalState.firstId, secondId);
      modalState = {
        ...modalState,
        secondId,
        topic: available.includes(modalState.topic) ? modalState.topic : available[0] ?? "appearance",
      };
      renderModal();
    }
    if (action === "discussion-topic" && modalState?.type === "discussion") {
      modalState = { ...modalState, topic: target.dataset.topic as Topic };
      renderModal();
    }
    if (action === "discussion-confirm" && modalState?.type === "discussion") {
      const { firstId, secondId, topic } = modalState;
      closeModal();
      options.onDiscuss(firstId, secondId, topic);
    }
    if (action === "choose-mother") {
      closeModal();
      options.onChooseMother(target.dataset.frogId as FrogId);
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
    actions.textContent = String(state.actionsLeft);
    phase.textContent = state.phase === "ending" ? "旅程结算" : state.atPond ? "月牙荷塘" : "沿河取证";

    agentOrder.forEach((agentId) => renderSquadMember(cards.get(agentId)!, state, agentId));
    const selected = state.selectedAgentId ? state.agents[state.selectedAgentId] : undefined;
    selectionLabel.textContent = selected ? `已选择 ${selected.name}` : "尚未选择蝌蚪";
    selectionHint.textContent = selected
      ? `${personalityLabels[selected.personality]} · ${modeLabels[selected.mode]}`
      : "点击蝌蚪，或按 1-3";
    detailsButton.disabled = !selected;
    recallButton.disabled = !selected || (selected.mode !== "approaching" && selected.mode !== "interacting");

    renderPrompt(state, selected?.id);
    renderDrawer(state, selected?.id);
    renderEnding(state);
    if (modalState) renderModal();
  }

  function renderPrompt(state: Readonly<GameState>, selectedId?: AgentId): void {
    prompt.replaceChildren();
    if (state.phase === "ending") {
      prompt.hidden = true;
      return;
    }
    if (state.atPond) {
      prompt.append(
        element("span", "prompt-copy", "三只候选青蛙正在荷塘等候"),
        actionButton("查看候选妈妈", "open-mothers"),
      );
      prompt.hidden = false;
      return;
    }
    if (state.nearbyNpcId) {
      const npc = demoCase.npcs.find((candidate) => candidate.id === state.nearbyNpcId)!;
      const agent = selectedId ? state.agents[selectedId] : undefined;
      const canInvestigate = Boolean(
        agent && agent.mode === "following" && state.actionsLeft > 0 && !state.discussion,
      );
      prompt.append(
        element(
          "span",
          "prompt-copy",
          agent ? `${agent.name}可以向${npc.name}打听线索` : `${npc.name}就在附近，先选择一只蝌蚪`,
        ),
      );
      if (canInvestigate) prompt.append(actionButton("开始调查", "investigate-nearby"));
      prompt.hidden = false;
      return;
    }
    prompt.hidden = true;
  }

  function renderDrawer(state: Readonly<GameState>, selectedId?: AgentId): void {
    const agent = selectedId ? state.agents[selectedId] : undefined;
    drawer.hidden = !drawerOpen || !agent || state.phase === "ending";
    if (!agent) return;
    drawerName.textContent = agent.name;
    drawerPersonality.textContent = personalityLabels[agent.personality];
    drawerStatus.textContent = `${modeLabels[agent.mode]} · ${agent.memories.filter(Boolean).length}/3 条记忆`;
    memoryList.replaceChildren();
    agent.memories.forEach((memory, index) => memoryList.append(memoryRow(memory, index)));
    const discussButton = requireElement<HTMLButtonElement>(drawer, '[data-action="open-discussion"]');
    discussButton.disabled =
      state.actionsLeft <= 0 ||
      !agent.memories.some(Boolean) ||
      !agentOrder.some((id) => id !== agent.id && state.agents[id].memories.some(Boolean));
  }

  function renderEnding(state: Readonly<GameState>): void {
    ending.hidden = state.phase !== "ending" || !state.ending;
    if (!state.ending) return;
    const selected = demoCase.candidates.find((candidate) => candidate.id === state.ending!.selectedMotherId)!;
    const correct = demoCase.candidates.find((candidate) => candidate.id === demoCase.motherId)!;
    ending.replaceChildren();
    const panel = element("div", "ending-panel");
    panel.append(
      element("span", "ending-kicker", state.ending.correct ? "找到了" : "还不是她"),
      element("h1", "ending-title", state.ending.correct ? `${correct.name}就是妈妈` : `${selected.name}摇了摇头`),
      element(
        "p",
        "ending-copy",
        state.ending.correct
          ? "荷叶帽、黄色腹部和芦苇湾的线索终于拼在了一起。"
          : `真正的妈妈是${correct.name}。回看证据，找出哪条记忆缺少了语境。`,
      ),
    );
    const timeline = element("ol", "evidence-timeline");
    state.evidenceLog.forEach((evidence) => {
      const item = document.createElement("li");
      item.append(
        element("span", "evidence-source", evidence.sourceLabel),
        element("strong", "", evidence.summary),
      );
      timeline.append(item);
    });
    if (state.evidenceLog.length === 0) timeline.append(element("li", "", "你还没有带回足够证据。"));
    panel.append(timeline, actionButton("重新出发", "restart"));
    ending.append(panel);
  }

  function openInvestigation(): void {
    const state = lastState;
    if (!state?.selectedAgentId || !state.nearbyNpcId) return;
    modalState = { type: "investigate", agentId: state.selectedAgentId, npcId: state.nearbyNpcId };
    renderModal();
  }

  function openDiscussion(): void {
    const state = lastState;
    const firstId = state?.selectedAgentId;
    if (!state || !firstId) return;
    const secondId = agentOrder.find((id) => id !== firstId && commonTopics(state, firstId, id).length > 0);
    if (!secondId) return;
    modalState = {
      type: "discussion",
      firstId,
      secondId,
      topic: commonTopics(state, firstId, secondId)[0]!,
    };
    renderModal();
  }

  function openMotherChoice(): void {
    modalState = { type: "mother" };
    renderModal();
  }

  function renderModal(): void {
    const state = lastState;
    if (!modalState || !state) {
      modalLayer.hidden = true;
      return;
    }
    modalLayer.hidden = false;
    modalContent.replaceChildren();

    const close = actionButton("×", "modal-close", "icon-button subtle modal-close");
    close.setAttribute("aria-label", "关闭");
    const header = element("header", "modal-header");
    const title = element("h2", "", "");
    title.id = "modal-title";
    header.append(title, close);
    modalContent.append(header);

    if (modalState.type === "investigate") {
      const currentModal = modalState;
      const npc = demoCase.npcs.find((candidate) => candidate.id === currentModal.npcId)!;
      const agent = state.agents[currentModal.agentId];
      title.textContent = `让${agent.name}调查${npc.name}`;
      modalContent.append(element("p", "modal-intro", "你听不见原话，只会看到它留下的记忆。"));
      const choices = element("div", "choice-list");
      npc.topics.forEach((topic) => {
        const button = actionButton("", "investigate", "choice-row");
        button.dataset.agentId = agent.id;
        button.dataset.npcId = npc.id;
        button.dataset.topic = topic;
        button.append(
          element("strong", "", topicLabels[topic]),
          element("span", "", topicHints[topic]),
        );
        choices.append(button);
      });
      modalContent.append(choices);
    }

    if (modalState.type === "discussion") {
      const currentModal = modalState;
      const first = state.agents[currentModal.firstId];
      title.textContent = `让${first.name}和同伴对证`;
      modalContent.append(element("p", "modal-intro", "选择另一只蝌蚪，以及要核对的记忆议题。"));
      const agents = element("div", "segment-group");
      agentOrder
        .filter((id) => id !== currentModal.firstId && state.agents[id].memories.some(Boolean))
        .forEach((agentId) => {
          const button = actionButton(state.agents[agentId].name, "discussion-agent", "segment-button");
          button.dataset.agentId = agentId;
          button.setAttribute("aria-pressed", String(agentId === currentModal.secondId));
          agents.append(button);
        });
      const availableTopics = commonTopics(state, currentModal.firstId, currentModal.secondId);
      const topicGroup = element("div", "segment-group");
      topics.forEach((topic) => {
        const button = actionButton(topicLabels[topic], "discussion-topic", "segment-button");
        button.dataset.topic = topic;
        button.disabled = !availableTopics.includes(topic);
        button.setAttribute("aria-pressed", String(topic === currentModal.topic));
        topicGroup.append(button);
      });
      const confirm = actionButton("开始对证", "discussion-confirm", "text-button primary");
      confirm.disabled = !availableTopics.includes(currentModal.topic);
      modalContent.append(agents, topicGroup, confirm);
    }

    if (modalState.type === "mother") {
      title.textContent = "谁是妈妈？";
      modalContent.append(element("p", "modal-intro", "观察三只青蛙的外形，再结合小队记忆做出选择。"));
      const choices = element("div", "choice-list mother-choices");
      demoCase.candidates.forEach((candidate, index) => {
        const button = actionButton("", "choose-mother", "choice-row");
        button.dataset.frogId = candidate.id;
        button.append(
          element("span", "candidate-letter", String.fromCharCode(65 + index)),
          element("strong", "", candidate.name),
        );
        choices.append(button);
      });
      modalContent.append(choices);
    }
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
    openMotherChoice,
    closeModal,
    dispose() {
      options.root.removeEventListener("click", onRootClick);
      modalLayer.removeEventListener("click", onBackdropClick);
    },
  };
}

function renderSquadMember(
  button: HTMLButtonElement,
  state: Readonly<GameState>,
  agentId: AgentId,
): void {
  const agent = state.agents[agentId];
  requireElement<HTMLElement>(button, ".squad-member__name").textContent = agent.name;
  requireElement<HTMLElement>(button, ".squad-member__mode").textContent = modeLabels[agent.mode];
  [...button.querySelectorAll<HTMLElement>(".memory-pip")].forEach((pip, index) => {
    const memory = agent.memories[index];
    pip.classList.toggle("has-memory", Boolean(memory));
    pip.classList.toggle("is-questioned", memory?.confidence === "questioned");
    pip.classList.toggle("is-confirmed", memory?.confidence === "confirmed");
  });
  const selected = state.selectedAgentId === agentId;
  button.classList.toggle("is-selected", selected);
  button.classList.toggle("is-away", agent.mode === "approaching" || agent.mode === "interacting");
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute(
    "aria-label",
    `${agent.name} ${personalityLabels[agent.personality]} ${modeLabels[agent.mode]} ${agent.memories.filter(Boolean).length}条记忆`,
  );
}

function memoryRow(memory: Memory | null, index: number): HTMLElement {
  const row = element("article", `memory-row${memory ? " has-memory" : ""}`);
  row.append(element("span", "memory-index", String(index + 1)));
  if (!memory) {
    row.append(element("span", "memory-empty", "空记忆槽"));
    return row;
  }
  const copy = element("div", "memory-copy");
  copy.append(
    element("strong", "", memory.summary),
    element(
      "span",
      "",
      `${topicLabels[memory.topic]} · ${memory.rememberedSource} · ${confidenceLabel(memory.confidence)}`,
    ),
  );
  row.append(copy);
  return row;
}

function commonTopics(
  state: Readonly<GameState>,
  firstId: AgentId,
  secondId: AgentId,
): Topic[] {
  const firstHasMemory = state.agents[firstId].memories.some(Boolean);
  const secondHasMemory = state.agents[secondId].memories.some(Boolean);
  if (!firstHasMemory || !secondHasMemory) return [];
  const rememberedTopics = new Set<Topic>();
  state.agents[firstId].memories.forEach((memory) => {
    if (memory) rememberedTopics.add(memory.topic);
  });
  state.agents[secondId].memories.forEach((memory) => {
    if (memory) rememberedTopics.add(memory.topic);
  });
  return topics.filter((topic) => rememberedTopics.has(topic));
}

function confidenceLabel(confidence: Memory["confidence"]): string {
  if (confidence === "questioned") return "存疑";
  if (confidence === "confirmed") return "已印证";
  return "相信";
}

function actionButton(
  label: string,
  action: string,
  className = "text-button",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing HUD element: ${selector}`);
  return node;
}
