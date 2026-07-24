import type { AgentService } from "../../ai/agentService";
import type {
  AgentId,
  DiscussionState,
  EvidenceEvent,
  FrogId,
  InvestigationTask,
  Memory,
  MemoryUpdate,
  NpcId,
  Topic,
} from "../../core/types";
import { chooseMemorySlot } from "../memory/memorySystem";
import { demoCase } from "../case/demoCase";
import type { GameStore } from "../state/gameStore";

export interface GameDirector {
  update(delta: number): void;
  startInvestigation(agentId: AgentId, npcId: NpcId, topic: Topic, autonomous?: boolean): boolean;
  arriveAtNpc(agentId: AgentId, taskId: string): void;
  recall(agentId: AgentId): boolean;
  startDiscussion(firstId: AgentId, secondId: AgentId, topic: Topic): boolean;
  chooseMother(frogId: FrogId): boolean;
  reset(): void;
}

export function createGameDirector(options: {
  store: GameStore;
  service: AgentService;
}): GameDirector {
  const interactionTimers = new Map<string, number>();
  const pendingRequests = new Set<string>();
  let sequence = 0;
  let generation = 0;

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function startInvestigation(
    agentId: AgentId,
    npcId: NpcId,
    topic: Topic,
    autonomous = false,
  ): boolean {
    const state = options.store.getState();
    const agent = state.agents[agentId];
    const npc = demoCase.npcs.find((candidate) => candidate.id === npcId);
    if (!npc || !npc.topics.includes(topic)) return false;
    if (state.phase !== "explore" || state.actionsLeft <= 0 || agent.mode !== "following") return false;

    const task: InvestigationTask = {
      id: nextId("investigation"),
      npcId,
      topic,
      autonomous,
    };
    options.store.dispatch({ type: "START_INVESTIGATION", agentId, task });
    if (options.store.getState().agents[agentId].activeTask?.id !== task.id) return false;
    options.store.dispatch({
      type: "SET_OBJECTIVE",
      objective: autonomous
        ? `${agent.name}发现了${npc.name}，正在自主离队`
        : `${agent.name}正在前往${npc.name}调查${topicLabel(topic)}`,
    });
    return true;
  }

  function arriveAtNpc(agentId: AgentId, taskId: string): void {
    const agent = options.store.getState().agents[agentId];
    if (agent.activeTask?.id !== taskId || agent.mode !== "approaching") return;
    interactionTimers.set(taskId, 0);
    options.store.dispatch({ type: "BEGIN_INTERACTION", agentId, taskId });
    const npc = demoCase.npcs.find((candidate) => candidate.id === agent.activeTask?.npcId);
    options.store.dispatch({
      type: "SET_OBJECTIVE",
      objective: `${agent.name}正在和${npc?.name ?? "目击者"}交谈，你听不见它们说什么`,
    });
  }

  function update(delta: number): void {
    const state = options.store.getState();
    Object.values(state.agents).forEach((agent) => {
      const task = agent.activeTask;
      if (!task || agent.mode !== "interacting") return;
      const elapsed = (interactionTimers.get(task.id) ?? 0) + delta;
      interactionTimers.set(task.id, elapsed);
      if (elapsed >= 1.15) void finishInvestigation(agent.id, task, generation);
    });
  }

  async function finishInvestigation(
    agentId: AgentId,
    task: InvestigationTask,
    requestGeneration: number,
  ): Promise<void> {
    if (pendingRequests.has(task.id)) return;
    pendingRequests.add(task.id);
    const state = options.store.getState();
    const agent = state.agents[agentId];
    const npc = demoCase.npcs.find((candidate) => candidate.id === task.npcId)!;
    const allowedFacts = npc.facts.filter((fact) => fact.topic === task.topic);

    try {
      const response = await options.service.encodeMemory({
        requestId: task.id,
        task: "encode_memory",
        agent: { id: agent.id, personality: agent.personality },
        npc: { id: npc.id, name: npc.name },
        topic: task.topic,
        allowedFacts: [...allowedFacts],
        memories: [...agent.memories],
      });
      if (requestGeneration !== generation) return;
      const currentAgent = options.store.getState().agents[agentId];
      if (currentAgent.activeTask?.id !== task.id || currentAgent.mode !== "interacting") return;
      if (response.result.task !== "encode_memory") return;

      const memory: Memory = {
        id: nextId("memory"),
        factIds: response.result.selectedFactIds,
        topic: task.topic,
        summary: response.result.spokenSummary,
        rememberedSource: npc.name,
        sourceNpcId: npc.id,
        emotion: response.result.tone,
        confidence: "believed",
        createdAt: Date.now(),
        reinforced: false,
        resultSource: response.source,
      };
      const evidence: EvidenceEvent = {
        id: nextId("evidence"),
        kind: "investigation",
        agentIds: [agentId],
        topic: task.topic,
        summary: memory.summary,
        sourceLabel: `${npc.name} · ${response.source === "model" ? "AI 记忆" : "本地回退"}`,
        createdAt: Date.now(),
      };
      options.store.dispatch({
        type: "COMPLETE_INVESTIGATION",
        agentId,
        taskId: task.id,
        memory,
        slot: chooseMemorySlot(currentAgent),
        evidence,
      });
      interactionTimers.delete(task.id);
    } finally {
      pendingRequests.delete(task.id);
    }
  }

  function recall(agentId: AgentId): boolean {
    const agent = options.store.getState().agents[agentId];
    if (agent.mode !== "approaching" && agent.mode !== "interacting") return false;
    if (agent.activeTask) interactionTimers.delete(agent.activeTask.id);
    options.store.dispatch({ type: "RECALL_AGENT", agentId });
    options.store.dispatch({ type: "SET_OBJECTIVE", objective: `${agent.name}放弃了调查，正在返回队伍` });
    return true;
  }

  function startDiscussion(firstId: AgentId, secondId: AgentId, topic: Topic): boolean {
    const state = options.store.getState();
    const firstMemories = state.agents[firstId].memories.filter(
      (memory): memory is Memory => Boolean(memory),
    );
    const secondMemories = state.agents[secondId].memories.filter(
      (memory): memory is Memory => Boolean(memory),
    );
    if (firstMemories.length === 0 || secondMemories.length === 0) return false;

    const discussion: DiscussionState = {
      id: nextId("discussion"),
      agentIds: [firstId, secondId],
      topic,
    };
    options.store.dispatch({ type: "START_DISCUSSION", discussion });
    if (options.store.getState().discussion?.id !== discussion.id) return false;
    void finishDiscussion(discussion, [...firstMemories, ...secondMemories], generation);
    return true;
  }

  async function finishDiscussion(
    discussion: DiscussionState,
    memories: Memory[],
    requestGeneration: number,
  ): Promise<void> {
    if (pendingRequests.has(discussion.id)) return;
    pendingRequests.add(discussion.id);
    const state = options.store.getState();
    const [firstId, secondId] = discussion.agentIds;

    try {
      const [response] = await Promise.all([
        options.service.reconcileMemories({
          requestId: discussion.id,
          task: "reconcile_memories",
          agentIds: discussion.agentIds,
          personalities: [state.agents[firstId].personality, state.agents[secondId].personality],
          topic: discussion.topic,
          memories,
        }),
        delay(650),
      ]);
      if (requestGeneration !== generation || options.store.getState().discussion?.id !== discussion.id) return;
      if (response.result.task !== "reconcile_memories") return;

      const ownerByMemory = new Map<string, AgentId>();
      discussion.agentIds.forEach((agentId) => {
        options.store.getState().agents[agentId].memories.forEach((memory) => {
          if (memory) ownerByMemory.set(memory.id, agentId);
        });
      });
      const updates: MemoryUpdate[] = [];
      response.result.acceptedMemoryIds.forEach((memoryId) => {
        const agentId = ownerByMemory.get(memoryId);
        if (agentId) updates.push({ agentId, memoryId, confidence: "confirmed", reinforced: true });
      });
      response.result.questionedMemoryIds.forEach((memoryId) => {
        const agentId = ownerByMemory.get(memoryId);
        if (agentId) updates.push({ agentId, memoryId, confidence: "questioned", reinforced: false });
      });

      const evidence: EvidenceEvent = {
        id: nextId("evidence"),
        kind: "discussion",
        agentIds: [...discussion.agentIds],
        topic: discussion.topic,
        summary: response.result.spokenSummary,
        sourceLabel: response.source === "model" ? "AI 对证" : "本地对证",
        createdAt: Date.now(),
      };
      options.store.dispatch({
        type: "COMPLETE_DISCUSSION",
        discussionId: discussion.id,
        updates,
        evidence,
      });
    } finally {
      pendingRequests.delete(discussion.id);
    }
  }

  function chooseMother(frogId: FrogId): boolean {
    const state = options.store.getState();
    if (!state.atPond || state.phase === "ending") return false;
    options.store.dispatch({
      type: "CHOOSE_MOTHER",
      frogId,
      correct: frogId === demoCase.motherId,
    });
    return true;
  }

  function reset(): void {
    generation += 1;
    interactionTimers.clear();
    pendingRequests.clear();
    options.store.dispatch({ type: "RESET_GAME" });
  }

  return {
    update,
    startInvestigation,
    arriveAtNpc,
    recall,
    startDiscussion,
    chooseMother,
    reset,
  };
}

function topicLabel(topic: Topic): string {
  return topic === "appearance" ? "外貌" : topic === "location" ? "地点" : "来源";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
