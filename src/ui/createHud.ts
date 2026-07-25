import type { AgentId, AgentMode, EvidenceEvent, FrogId, GameState, GateId, Memory, NpcId, ObstacleId, Topic } from "../core/types";
import type { LlmConfigStore } from "../ai/llmConfig";
import { agentMarkerColors, communicationStyleLabels, personalityLabels } from "../game/agents/personality";
import { demoCase } from "../game/case/demoCase";
import { confirmedSourceCount, memoryUpgradeCost } from "../game/state/gameRules";

export interface Hud {
  render(state: Readonly<GameState>): void;
  renderWorldOverlays(overlays: WorldOverlays): void;
  toggleEvidence(): void;
  toggleMemory(): void;
  openMotherChoice(frogId?: FrogId): void;
  closeModal(): void;
  dispose(): void;
}

export type WorldOverlays = Readonly<{
  bubbles: ReadonlyArray<{
    targetType: "npc" | "obstacle" | "gate";
    targetId: NpcId | ObstacleId | GateId;
    label: string;
    detail: string;
    x: number;
    y: number;
  }>;
  progress: ReadonlyArray<{
    agentId: AgentId;
    label: string;
    value: number;
    x: number;
    y: number;
  }>;
  utterances: ReadonlyArray<{
    agentId: AgentId;
    text: string;
    kind: "idle" | "autonomous" | "peer" | "tired";
    x: number;
    y: number;
  }>;
  frogIndicators: ReadonlyArray<{
    frogId: FrogId;
    label: string;
    x: number;
    y: number;
    angle: number;
  }>;
}>;

type ModalState =
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
export function createHud(options: {
  root: HTMLElement;
  onSelect(agentId: AgentId): void;
  onRecall(agentId: AgentId): void;
  onInvestigate(agentIds: AgentId[], npcId: NpcId): void;
  onCleanup(agentIds: AgentId[], obstacleId: ObstacleId): void;
  onDiscuss(firstId: AgentId, secondId: AgentId, topic: Topic): void;
  onTeachJump(teacherId: AgentId, studentId: AgentId): void;
  onUpgradeMemory(agentId: AgentId): void;
  onScoutGate(gateId: GateId): void;
  onRest(): void;
  onChooseMother(frogId: FrogId): void;
  onDemoEnding(correct: boolean): void;
  onRestart(): void;
  onStart(): Promise<void>;
  llmConfig: LlmConfigStore;
}): Hud {
  const squad = requireElement<HTMLElement>(options.root, "[data-squad]");
  const objective = requireElement<HTMLElement>(options.root, "[data-objective]");
  const region = requireElement<HTMLElement>(options.root, "[data-region]");
  const inspiration = requireElement<HTMLElement>(options.root, "[data-inspiration]");
  const evidence = requireElement<HTMLElement>(options.root, "[data-evidence]");
  const prompt = requireElement<HTMLElement>(options.root, "[data-interaction-prompt]");
  const bubbleLayer = requireElement<HTMLElement>(options.root, "[data-world-bubbles]");
  const progressLayer = requireElement<HTMLElement>(options.root, "[data-agent-progress]");
  const speechLayer = requireElement<HTMLElement>(options.root, "[data-agent-speech]");
  const frogDirectionLayer = requireElement<HTMLElement>(options.root, "[data-frog-directions]");
  const candidateRevealNotice = requireElement<HTMLElement>(options.root, "[data-candidate-reveal-notice]");
  const drawer = requireElement<HTMLElement>(options.root, "[data-agent-drawer]");
  const drawerName = requireElement<HTMLElement>(options.root, "[data-drawer-name]");
  const drawerPersonality = requireElement<HTMLElement>(options.root, "[data-drawer-personality]");
  const meters = requireElement<HTMLElement>(options.root, "[data-agent-meters]");
  const memoryList = requireElement<HTMLElement>(options.root, "[data-memory-list]");
  const drawerActions = requireElement<HTMLElement>(options.root, "[data-drawer-actions]");
  const evidenceDrawer = requireElement<HTMLElement>(options.root, "[data-evidence-drawer]");
  const evidenceSummary = requireElement<HTMLElement>(options.root, "[data-evidence-summary]");
  const evidenceChain = requireElement<HTMLElement>(options.root, "[data-evidence-chain]");
  const modalLayer = requireElement<HTMLElement>(options.root, "[data-modal-layer]");
  const modalContent = requireElement<HTMLElement>(options.root, "[data-modal-content]");
  const ending = requireElement<HTMLElement>(options.root, "[data-ending]");
  const startScreen = requireElement<HTMLElement>(options.root, "[data-start-screen]");
  const loadingScreen = requireElement<HTMLElement>(options.root, "[data-loading-screen]");
  const loadingStatus = requireElement<HTMLElement>(options.root, "[data-loading-status]");
  const startButton = requireElement<HTMLButtonElement>(options.root, '[data-action="start-game"]');
  const settingsPanel = requireElement<HTMLElement>(options.root, "[data-settings-panel]");
  const baseUrlInput = requireElement<HTMLInputElement>(options.root, "[data-llm-base-url]");
  const modelInput = requireElement<HTMLInputElement>(options.root, "[data-llm-model]");
  const apiKeyInput = requireElement<HTMLInputElement>(options.root, "[data-llm-api-key]");
  const defaultPanel = requireElement<HTMLElement>(options.root, "[data-llm-default-panel]");
  const customPanel = requireElement<HTMLElement>(options.root, "[data-llm-custom-panel]");
  const modeButtons = Array.from(options.root.querySelectorAll<HTMLButtonElement>("[data-action=select-llm-mode]"));
  const settingsStatus = requireElement<HTMLElement>(options.root, "[data-settings-status]");

  const cards = new Map<AgentId, HTMLButtonElement>();
  const bubbleButtons = new Map<string, HTMLButtonElement>();
  const progressBars = new Map<AgentId, HTMLElement>();
  const speechBubbles = new Map<AgentId, HTMLElement>();
  const frogDirectionIndicators = new Map<FrogId, HTMLElement>();
  let lastState: Readonly<GameState> | null = null;
  let drawerOpen = false;
  let evidenceOpen = false;
  let modalState: ModalState = null;
  let starting = false;
  let loadingTimer: number | undefined;
  let draftLlmMode: "default" | "custom" = "default";
  let promptKey: string | null = null;
  let promptTimer: number | undefined;
  let candidateRevealTimer: number | undefined;
  options.root.dataset.screen = "title";

  function renderSettings(): void {
    const config = options.llmConfig.get();
    draftLlmMode = config.mode;
    baseUrlInput.value = config.baseUrl;
    modelInput.value = config.model;
    apiKeyInput.value = config.apiKey;
    syncLlmModeUi();
    settingsStatus.textContent = config.mode === "default"
      ? "当前使用默认模型，失败时自动回退到本地 Agent"
      : "当前使用自定义模型，失败时自动回退到本地 Agent";
  }

  function syncLlmModeUi(): void {
    const isDefault = draftLlmMode === "default";
    defaultPanel.hidden = !isDefault;
    customPanel.hidden = isDefault;
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === draftLlmMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function openSettings(): void {
    renderSettings();
    settingsPanel.hidden = false;
  }

  function closeSettings(): void {
    settingsPanel.hidden = true;
  }

  agentOrder.forEach((agentId, index) => {
    const button = element("button", "squad-member") as HTMLButtonElement;
    button.type = "button";
    button.dataset.agentId = agentId;
    button.style.setProperty("--agent-color", colorHex(agentMarkerColors[agentId]));
    const heading = element("span", "squad-member__heading");
    heading.append(element("strong", "squad-member__name"), element("kbd", "squad-member__shortcut", String(index + 1)));
    button.append(
      element("span", "squad-member__crest"),
      heading,
      element("span", "squad-member__mode"),
      element("span", "memory-pips"),
      element("span", "fatigue-mini"),
    );
    squad.append(button);
    cards.set(agentId, button);
  });

  const onRootClick = async (event: MouseEvent): Promise<void> => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!target) return;
    const agentId = target.dataset.agentId as AgentId | undefined;
    if (agentId && target.classList.contains("squad-member")) {
      if (lastState?.selectedAgentId === agentId && selectedAgentIds(lastState).length === 1) drawerOpen = !drawerOpen;
      else options.onSelect(agentId);
      renderCurrent();
      return;
    }

    const action = target.dataset.action;
    if (action === "start-game") {
      if (starting) return;
      starting = true;
      startButton.disabled = true;
      startScreen.hidden = true;
      loadingScreen.hidden = false;
      options.root.dataset.screen = "loading";
      const statuses = ["正在唤醒河流里的 Agent…", "正在生成三只蝌蚪的性格…", "正在描绘候选妈妈的形象…", "正在整理本局小队…"];
      let statusIndex = 0;
      loadingStatus.textContent = statuses[statusIndex]!;
      loadingTimer = window.setInterval(() => {
        statusIndex = (statusIndex + 1) % statuses.length;
        loadingStatus.textContent = statuses[statusIndex]!;
      }, 900);
      try {
        await options.onStart();
        loadingStatus.textContent = "准备完成，开始旅程";
        await new Promise((resolve) => window.setTimeout(resolve, 420));
        loadingScreen.hidden = true;
        options.root.dataset.screen = "game";
      } catch {
        loadingStatus.textContent = "生成失败，已使用本地角色模板";
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        loadingScreen.hidden = true;
      } finally {
        if (loadingTimer !== undefined) window.clearInterval(loadingTimer);
        loadingTimer = undefined;
        starting = false;
        startButton.disabled = false;
      }
    }
    if (action === "open-settings") openSettings();
    if (action === "close-settings") closeSettings();
    if (action === "select-llm-mode") {
      if (target.dataset.mode === "default" || target.dataset.mode === "custom") {
        draftLlmMode = target.dataset.mode;
        syncLlmModeUi();
        settingsStatus.textContent = draftLlmMode === "default"
          ? "将使用服务端默认模型"
          : "请输入自定义模型服务地址、名称和 Key";
      }
    }
    if (action === "save-settings") {
      if (draftLlmMode === "custom") {
        const baseUrl = baseUrlInput.value.trim();
        const validUrl = (() => {
          try { return new URL(baseUrl).protocol === "https:"; } catch { return false; }
        })();
        if (!validUrl || !modelInput.value.trim() || !apiKeyInput.value) {
          settingsStatus.textContent = "自定义模式需要 HTTPS 服务地址、模型名称和 API Key";
          return;
        }
      }
      options.llmConfig.set({
        mode: draftLlmMode,
        baseUrl: baseUrlInput.value.trim(),
        model: modelInput.value.trim(),
        apiKey: apiKeyInput.value,
      });
      settingsStatus.textContent = draftLlmMode === "default" ? "已切换到默认模型" : "自定义模型设置已保存";
    }
    if (action === "reset-settings") {
      options.llmConfig.reset();
      renderSettings();
    }
    if (action === "close-drawer") { drawerOpen = false; renderCurrent(); }
    if (action === "close-evidence") { evidenceOpen = false; renderCurrent(); }
    if (action === "recall" && lastState?.selectedAgentId) options.onRecall(lastState.selectedAgentId);
    if (action === "talk-mother") openMotherChoice();
    if (action === "open-discussion") openDiscussion();
    if (action === "upgrade-memory" && lastState?.selectedAgentId) options.onUpgradeMemory(lastState.selectedAgentId);
    if (action === "teach-jump" && lastState?.selectedAgentId) options.onTeachJump(lastState.selectedAgentId, target.dataset.studentId as AgentId);
    if (action === "scout-gate") options.onScoutGate("dragonfly-gap");
    if (action === "rest") options.onRest();
    if (action === "modal-close") closeModal();
    if (action === "restart") options.onRestart();
    if (action === "demo-ending-success" || action === "demo-ending-failure") {
      closeSettings();
      options.onDemoEnding(action === "demo-ending-success");
    }
    if (action === "world-dialogue" && lastState) {
      options.onInvestigate(selectedAgentIds(lastState), target.dataset.targetId as NpcId);
    }
    if (action === "world-cleanup" && lastState) {
      options.onCleanup(selectedAgentIds(lastState), target.dataset.targetId as ObstacleId);
    }
    if (action === "world-scout-gate") options.onScoutGate(target.dataset.targetId as GateId);
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
    const candidatesJustRevealed = state.candidateFrogsRevealed && !lastState?.candidateFrogsRevealed;
    lastState = state;
    objective.textContent = state.objective;
    const regionDefinition = demoCase.regions.find((candidate) => candidate.id === state.currentRegionId)!;
    region.textContent = regionDefinition.name;
    inspiration.textContent = String(state.inspiration);
    evidence.textContent = `${confirmedSourceCount(state)}/2`;
    agentOrder.forEach((id) => renderSquadMember(cards.get(id)!, state, id));
    const selected = state.selectedAgentId ? state.agents[state.selectedAgentId] : undefined;
    renderPrompt(state, selected?.id);
    renderDrawer(state, selected?.id);
    renderEvidence(state);
    renderEnding(state);
    if (candidatesJustRevealed && state.phase === "explore") showCandidateRevealNotice();
    if (modalState) renderModal();
  }

  function showCandidateRevealNotice(): void {
    candidateRevealNotice.hidden = false;
    if (candidateRevealTimer !== undefined) window.clearTimeout(candidateRevealTimer);
    candidateRevealTimer = window.setTimeout(() => {
      candidateRevealNotice.hidden = true;
      candidateRevealTimer = undefined;
    }, 4_800);
  }

  function renderPrompt(state: Readonly<GameState>, selectedId?: AgentId): void {
    if (state.phase === "ending") { hidePrompt(); return; }
    if (state.nearbyNpcId) {
      const npc = demoCase.npcs.find((candidate) => candidate.id === state.nearbyNpcId)!;
      const temperamentCue = npc.intimidation === "high"
        ? "气势逼人，胆小的蝌蚪可能会慌"
        : npc.intimidation === "mild"
          ? "动作突然，容易打断不合适的蝌蚪"
          : "交流节奏比较稳定";
      showPrompt(
        `npc:${npc.id}:${selectedId ? "selected" : "none"}`,
        element("span", "prompt-copy", selectedId
          ? `${npc.name}：${npc.credibilityCue}；${temperamentCue}。点击头顶气泡开始聊天`
          : `先选择蝌蚪，再和${npc.name}聊天；${npc.credibilityCue}，${temperamentCue}`),
      );
    } else if (state.nearbyObstacleId) {
      const obstacle = demoCase.obstacles.find((candidate) => candidate.id === state.nearbyObstacleId)!;
      showPrompt(`obstacle:${obstacle.id}:${selectedId ? "selected" : "none"}`, element("span", "prompt-copy", selectedId ? `悬停${obstacle.name}，点击头顶气泡安排清理` : `先选择蝌蚪 · 清理可得 ${obstacle.reward} 灵感`));
    } else if (state.nearbyFrogId) {
      const frog = demoCase.candidates.find((candidate) => candidate.id === state.nearbyFrogId)!;
      showPrompt(`frog:${frog.id}`, element("span", "prompt-copy", `${frog.name}正在这里休息`), actionButton("交谈", "talk-mother", "text-button text-button--pink"));
    } else if (state.nearbyGateId === "dragonfly-gap") {
      const selected = state.selectedAgentIds.length === 1 && selectedId ? state.agents[selectedId] : undefined;
      const scouted = state.scoutedGateIds.includes("dragonfly-gap");
      const copy = scouted
        ? "对岸的信息已经带回来了"
        : !selected
          ? "只选择一只会跳跃的蝌蚪，然后点击叶隙"
          : selected.jumpKnowledge !== "learned"
            ? `${selected.name}还没有掌握跳跃`
            : selected.mode !== "following"
              ? `${selected.name}需要先回到队伍`
              : `点击叶隙，让${selected.name}跳过去侦察`;
      const canScout = Boolean(selected && selected.jumpKnowledge === "learned" && selected.mode === "following" && selected.fatigue < 90 && !scouted);
      showPrompt(
        `gate:dragonfly-gap:${selected?.id ?? "none"}:${selected?.jumpKnowledge ?? "none"}:${selected?.mode ?? "none"}:${scouted}`,
        element("span", "prompt-copy", copy),
        ...(canScout ? [actionButton(`让${selected!.name}跳过去`, "scout-gate", "text-button text-button--pink")] : []),
      );
    } else if (state.nearbyGateId === "lotus-gate") {
      const learnedCount = agentOrder.filter((id) => state.agents[id].jumpKnowledge === "learned").length;
      showPrompt(`gate:lotus-gate:${learnedCount}`, element("span", "prompt-copy", learnedCount === 3 ? "三只蝌蚪都准备好了，长桥已经畅通" : `跳跃掌握 ${learnedCount}/3`));
    } else if (state.atRestSpot) {
      showPrompt("rest", element("span", "prompt-copy", "孵化静池能让疲惫的小队安定下来"), actionButton("休息", "rest", "text-button text-button--green"));
    } else {
      hidePrompt();
    }
  }

  function showPrompt(key: string, ...children: HTMLElement[]): void {
    prompt.replaceChildren(...children);
    prompt.hidden = false;
    if (promptKey === key) return;
    promptKey = key;
    if (promptTimer !== undefined) window.clearTimeout(promptTimer);
    promptTimer = window.setTimeout(() => {
      if (promptKey === key) prompt.hidden = true;
      promptTimer = undefined;
    }, 3000);
  }

  function hidePrompt(): void {
    prompt.hidden = true;
    prompt.replaceChildren();
    promptKey = null;
    if (promptTimer !== undefined) {
      window.clearTimeout(promptTimer);
      promptTimer = undefined;
    }
  }

  function renderDrawer(state: Readonly<GameState>, selectedId?: AgentId): void {
    const agent = selectedId ? state.agents[selectedId] : undefined;
    drawer.hidden = !drawerOpen || !agent || state.phase === "ending";
    if (!agent) return;
    drawerName.textContent = agent.name;
    drawerPersonality.textContent = `${personalityLabels[agent.personality]}型 · ${communicationStyleLabels[agent.communicationStyle]}`;
    meters.replaceChildren(
      meter("疲劳", `${agent.fatigue}%`, agent.fatigue, agent.fatigue >= 70 ? "coral" : "green"),
      meter("跳跃", jumpLabel(agent.jumpKnowledge), agent.jumpKnowledge === "learned" ? 100 : agent.jumpKnowledge === "partial" ? 50 : 0, "cyan"),
    );
    memoryList.replaceChildren();
    agent.memories.slice(0, agent.memoryCapacity).forEach((memory, index) => memoryList.append(memoryRow(memory, index)));
    drawerActions.replaceChildren();
    if (agent.activeTask) drawerActions.append(actionButton("召回蝌蚪", "recall", "text-button text-button--pink"));
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

  function renderEvidence(state: Readonly<GameState>): void {
    evidenceDrawer.hidden = !evidenceOpen || state.phase === "ending";
    if (!evidenceOpen || state.phase === "ending") return;
    const sourceCount = confirmedSourceCount(state);
    evidenceSummary.textContent = sourceCount >= 2
      ? "两条独立来源已经拼齐，可以开始判断妈妈是谁。"
      : `已确认 ${sourceCount}/2 条独立来源，继续派蝌蚪去听听河边的朋友。`;
    evidenceChain.replaceChildren();
    if (state.evidenceLog.length === 0) {
      evidenceChain.append(element("p", "evidence-chain__empty", "还没有记录。让蝌蚪去聊天、清理或互相对证，线索会贴在这里。"));
      return;
    }
    state.evidenceLog.slice().reverse().forEach((event) => evidenceChain.append(evidenceRow(event, state)));
  }

  function renderEnding(state: Readonly<GameState>): void {
    ending.hidden = state.phase !== "ending" || !state.ending;
    if (!state.ending) return;
    const selected = demoCase.candidates.find((candidate) => candidate.id === state.ending!.selectedMotherId)!;
    const correct = demoCase.candidates.find((candidate) => candidate.id === demoCase.motherId)!;
    ending.replaceChildren();
    const panel = element("div", `ending-panel ${state.ending.correct ? "is-correct" : "is-wrong"}`);
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

  function renderWorldOverlays(overlays: WorldOverlays): void {
    const visibleBubbles = new Set<string>();
    overlays.bubbles.forEach((overlay) => {
      const key = `${overlay.targetType}:${overlay.targetId}`;
      visibleBubbles.add(key);
      let button = bubbleButtons.get(key);
      if (!button) {
        const action = overlay.targetType === "npc"
          ? "world-dialogue"
          : overlay.targetType === "obstacle"
            ? "world-cleanup"
            : "world-scout-gate";
        button = actionButton("", action, `world-bubble world-bubble--${overlay.targetType}`);
        button.dataset.targetId = overlay.targetId;
        button.append(element("strong"), element("span"));
        bubbleLayer.append(button);
        bubbleButtons.set(key, button);
      }
      requireElement<HTMLElement>(button, "strong").textContent = overlay.label;
      requireElement<HTMLElement>(button, "span").textContent = overlay.detail;
      button.style.left = `${overlay.x}px`;
      button.style.top = `${overlay.y}px`;
      button.hidden = false;
    });
    bubbleButtons.forEach((button, key) => { button.hidden = !visibleBubbles.has(key); });

    const visibleProgress = new Set<AgentId>();
    overlays.progress.forEach((overlay) => {
      visibleProgress.add(overlay.agentId);
      let bar = progressBars.get(overlay.agentId);
      if (!bar) {
        bar = element("div", "agent-task-progress");
        bar.append(element("span"), element("i", "agent-task-progress__track", ""));
        requireElement<HTMLElement>(bar, ".agent-task-progress__track").append(element("b"));
        progressLayer.append(bar);
        progressBars.set(overlay.agentId, bar);
      }
      requireElement<HTMLElement>(bar, "span").textContent = overlay.label;
      bar.style.left = `${overlay.x}px`;
      bar.style.top = `${overlay.y}px`;
      bar.style.setProperty("--task-progress", `${Math.round(overlay.value * 100)}%`);
      bar.hidden = false;
    });
    progressBars.forEach((bar, id) => { bar.hidden = !visibleProgress.has(id); });

    const visibleUtterances = new Set<AgentId>();
    overlays.utterances.forEach((overlay) => {
      visibleUtterances.add(overlay.agentId);
      let bubble = speechBubbles.get(overlay.agentId);
      if (!bubble) {
        bubble = element("div", "agent-speech-bubble");
        speechLayer.append(bubble);
        speechBubbles.set(overlay.agentId, bubble);
      }
      bubble.textContent = overlay.text;
      bubble.dataset.kind = overlay.kind;
      bubble.style.left = `${overlay.x}px`;
      bubble.style.top = `${overlay.y}px`;
      bubble.hidden = false;
    });
    speechBubbles.forEach((bubble, id) => { bubble.hidden = !visibleUtterances.has(id); });

    const visibleFrogIndicators = new Set<FrogId>();
    overlays.frogIndicators.forEach((overlay) => {
      visibleFrogIndicators.add(overlay.frogId);
      let indicator = frogDirectionIndicators.get(overlay.frogId);
      if (!indicator) {
        indicator = element("div", "frog-direction-indicator");
        indicator.append(
          element("span", "frog-direction-indicator__arrow", "↑"),
          element("span", "frog-direction-indicator__face", ""),
        );
        frogDirectionLayer.append(indicator);
        frogDirectionIndicators.set(overlay.frogId, indicator);
      }
      indicator.style.left = `${overlay.x}px`;
      indicator.style.top = `${overlay.y}px`;
      indicator.style.setProperty("--frog-accent", "#d94f55");
      requireElement<HTMLElement>(indicator, ".frog-direction-indicator__arrow").style.transform = `rotate(${overlay.angle}deg)`;
      indicator.title = overlay.label;
      indicator.setAttribute("aria-label", overlay.label);
      indicator.hidden = false;
    });
    frogDirectionIndicators.forEach((indicator, id) => { indicator.hidden = !visibleFrogIndicators.has(id); });
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
    if (!frogId || !lastState?.candidateFrogsRevealed) return;
    modalState = { type: "mother", frogId };
    renderModal();
  }

  function renderModal(): void {
    const state = lastState;
    if (!modalState || !state) { modalLayer.hidden = true; return; }
    modalLayer.hidden = false;
    modalLayer.dataset.modalType = modalState.type;
    modalContent.replaceChildren();
    const close = actionButton("×", "modal-close", "icon-button icon-button--plain modal-close");
    close.setAttribute("aria-label", "关闭");
    const header = element("header", "modal-header");
    const titleBlock = element("div", "modal-title-block");
    titleBlock.append(element("span", "modal-kicker", "现场记录"));
    const title = element("h2");
    title.id = "modal-title";
    titleBlock.append(title);
    header.append(titleBlock, close);
    modalContent.append(header);

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
      title.textContent = state.generatedCast?.frogs[current.frogId]?.name ?? frog.name;
      modalContent.append(element("p", "mother-description", state.generatedCast?.frogs[current.frogId]?.appearance ?? frog.description));
      if (sourceCount < 2) {
        modalContent.append(element("div", "mother-dialogue", "“你们一路辛苦了。再听听不同朋友怎么说吧，我不想让你们只凭第一印象决定。”"));
        modalContent.append(element("p", "modal-intro", `目前只有 ${sourceCount}/2 个独立来源完成对证。`));
      } else {
        modalContent.append(element("div", "mother-dialogue", "她安静地等待你们把证据和记忆放在一起。"));
        modalContent.append(actionButton("确认她是妈妈", "choose-mother", "text-button text-button--pink modal-confirm"));
      }
    }
  }

  function toggleEvidence(): void {
    if (!lastState) return;
    evidenceOpen = !evidenceOpen;
    if (evidenceOpen) drawerOpen = false;
    renderCurrent();
  }

  function toggleMemory(): void {
    if (!lastState) return;
    if (!lastState.selectedAgentId) {
      options.onSelect(agentOrder[0]!);
      drawerOpen = true;
      evidenceOpen = false;
      renderCurrent();
      return;
    }
    drawerOpen = !drawerOpen;
    if (drawerOpen) evidenceOpen = false;
    renderCurrent();
  }

  function closeModal(): void {
    modalState = null;
    modalLayer.hidden = true;
    delete modalLayer.dataset.modalType;
    modalContent.replaceChildren();
  }

  function renderCurrent(): void {
    if (lastState) render(lastState);
  }

  return {
    render,
    renderWorldOverlays,
    toggleEvidence,
    toggleMemory,
    openMotherChoice,
    closeModal,
    dispose() {
      options.root.removeEventListener("click", onRootClick);
      modalLayer.removeEventListener("click", onBackdropClick);
      closeSettings();
      hidePrompt();
      if (candidateRevealTimer !== undefined) window.clearTimeout(candidateRevealTimer);
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
  const selected = selectedAgentIds(state).includes(agentId);
  button.classList.toggle("is-selected", selected);
  button.classList.toggle("is-away", Boolean(agent.activeTask));
  button.classList.toggle("is-tired", agent.fatigue >= 70);
  button.dataset.personality = agent.personality;
  button.dataset.mode = agent.mode;
  button.dataset.memoryCount = String(agent.memories.filter(Boolean).length);
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute("aria-label", `${agent.name} ${personalityLabels[agent.personality]} ${modeLabels[agent.mode]} ${agent.memories.filter(Boolean).length}条记忆`);
}

function selectedAgentIds(state: Readonly<GameState>): AgentId[] {
  return state.selectedAgentIds.length > 0 ? [...state.selectedAgentIds] : state.selectedAgentId ? [state.selectedAgentId] : [];
}

function memoryRow(memory: Memory | null, index: number): HTMLElement {
  const confidenceClass = memory ? ` memory-row--${memory.confidence}` : " memory-row--empty";
  const row = element("article", `memory-row${memory ? " has-memory" : ""}${confidenceClass}`);
  row.append(element("span", "memory-index", String(index + 1)));
  if (!memory) { row.append(element("span", "memory-empty", "空记忆槽")); return row; }
  const copy = element("div", "memory-copy");
  const fidelity = memory.fidelity === "detailed" ? "细节完整" : memory.fidelity === "compressed" ? "像被精简过" : "只剩片段";
  const transmission = memory.transmission === "mixed" ? "混合记忆" : memory.transmission === "retold" ? "同伴转述" : "亲自听闻";
  const strength = memory.strength > 70 ? "清晰" : memory.strength > 35 ? "正在变淡" : "模糊";
  copy.append(
    element("strong", "", memory.summary),
    element("span", "", `${topicLabels[memory.topic]} · ${memory.rememberedSource} · ${confidenceLabel(memory.confidence)}`),
    element("small", "memory-provenance", `${transmission} · ${fidelity} · ${strength}`),
  );
  row.append(copy);
  return row;
}

function evidenceRow(event: EvidenceEvent, state: Readonly<GameState>): HTMLElement {
  const kindLabels: Record<EvidenceEvent["kind"], string> = {
    investigation: "现场听闻",
    discussion: "蝌蚪对证",
    cleanup: "清理发现",
    ability: "能力线索",
  };
  const row = element("article", "evidence-note");
  const agents = event.agentIds.map((agentId) => state.agents[agentId].name).join("、");
  const topic = event.topic ? ` · ${topicLabels[event.topic]}` : "";
  row.append(
    element("span", "evidence-note__kicker", `${kindLabels[event.kind]}${topic}`),
    element("strong", "", event.summary),
    element("small", "", `${event.sourceLabel} · ${agents || "小队记录"}`),
  );
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
