import type { AgentService } from "../../ai/agentService";
import type {
  AgentId,
  CleanupTask,
  DiscussionState,
  EvidenceEvent,
  FrogId,
  GateId,
  InvestigationTask,
  JumpKnowledge,
  Memory,
  MemoryUpdate,
  NpcId,
  ObstacleId,
  Topic,
} from "../../core/types";
import { chooseMemorySlot } from "../memory/memorySystem";
import { demoCase } from "../case/demoCase";
import { confirmedSourceCount } from "../state/gameRules";
import type { GameStore } from "../state/gameStore";

export interface GameDirector {
  update(delta: number): void;
  startInvestigation(agentIds: AgentId[], npcId: NpcId, topic: Topic, autonomous?: boolean): boolean;
  arriveAtNpc(agentId: AgentId, taskId: string): void;
  startCleanup(agentIds: AgentId[], obstacleId: ObstacleId): boolean;
  arriveAtObstacle(agentId: AgentId, taskId: string): void;
  recall(agentId: AgentId): boolean;
  startDiscussion(firstId: AgentId, secondId: AgentId, topic: Topic): boolean;
  teachJump(teacherId: AgentId, studentId: AgentId): boolean;
  scoutGate(gateId: GateId): boolean;
  upgradeMemory(agentId: AgentId): boolean;
  restSquad(): boolean;
  chooseMother(frogId: FrogId): boolean;
  reset(): void;
}

export function createGameDirector(options: { store: GameStore; service: AgentService }): GameDirector {
  const interactionTimers = new Map<string, number>();
  const cleanupTimers = new Map<string, number>();
  const pendingRequests = new Set<string>();
  let sequence = 0;
  let generation = 0;

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function startInvestigation(
    agentIds: AgentId[],
    npcId: NpcId,
    topic: Topic,
    autonomous = false,
  ): boolean {
    const state = options.store.getState();
    const npc = demoCase.npcs.find((candidate) => candidate.id === npcId);
    const participants = [...new Set(agentIds)].slice(0, 3);
    if (!npc || !(npc.topics as readonly Topic[]).includes(topic) || participants.length === 0) return false;
    if (participants.some((id) => state.agents[id].mode !== "following" || state.agents[id].fatigue >= 90)) return false;

    const tasks = participants.map((agentId) => ({
      agentId,
      task: {
        type: "investigation" as const,
        id: nextId("investigation"),
        npcId,
        topic,
        autonomous,
      },
    }));
    tasks.forEach(({ agentId, task }) => options.store.dispatch({ type: "START_INVESTIGATION", agentId, task }));
    const started = tasks.every(({ agentId, task }) => options.store.getState().agents[agentId].activeTask?.id === task.id);
    if (!started) return false;
    const names = participants.map((id) => state.agents[id].name).join("、");
    options.store.dispatch({
      type: "SET_OBJECTIVE",
      objective: autonomous ? `${names}正在越过叶隙侦察${npc.name}` : `${names}正在前往${npc.name}调查${topicLabel(topic)}`,
    });
    return true;
  }

  function arriveAtNpc(agentId: AgentId, taskId: string): void {
    const agent = options.store.getState().agents[agentId];
    if (agent.activeTask?.id !== taskId || agent.activeTask.type !== "investigation" || agent.mode !== "approaching") return;
    interactionTimers.set(taskId, 0);
    options.store.dispatch({ type: "BEGIN_INTERACTION", agentId, taskId });
    const target = demoCase.npcs.find((candidate) => candidate.id === (agent.activeTask as InvestigationTask).npcId);
    options.store.dispatch({ type: "SET_OBJECTIVE", objective: `${agent.name}正在和${target?.name ?? "目击者"}交谈，你听不见它们说什么` });
  }

  function startCleanup(agentIds: AgentId[], obstacleId: ObstacleId): boolean {
    const obstacle = demoCase.obstacles.find((candidate) => candidate.id === obstacleId);
    const participantIds = [...new Set(agentIds)].slice(0, 2);
    if (!obstacle || participantIds.length === 0) return false;
    const task: CleanupTask = { type: "cleanup", id: nextId("cleanup"), obstacleId, participantIds };
    options.store.dispatch({ type: "START_CLEANUP", task });
    return participantIds.every((id) => options.store.getState().agents[id].activeTask?.id === task.id);
  }

  function arriveAtObstacle(agentId: AgentId, taskId: string): void {
    const state = options.store.getState();
    const agent = state.agents[agentId];
    if (agent.activeTask?.id !== taskId || agent.activeTask.type !== "cleanup" || agent.mode !== "approaching") return;
    options.store.dispatch({ type: "BEGIN_WORK", agentId, taskId });
    const updated = options.store.getState();
    if (agent.activeTask.participantIds.every((id) => updated.agents[id].mode === "working")) cleanupTimers.set(taskId, 0);
  }

  function update(delta: number): void {
    const state = options.store.getState();
    Object.values(state.agents).forEach((agent) => {
      const task = agent.activeTask;
      if (!task || task.type !== "investigation" || agent.mode !== "interacting") return;
      const elapsed = (interactionTimers.get(task.id) ?? 0) + delta;
      interactionTimers.set(task.id, elapsed);
      if (elapsed >= 1.15) void finishInvestigation(agent.id, task, generation);
    });

    cleanupTimers.forEach((elapsed, taskId) => {
      const task = findCleanupTaskFromAgent(options.store, taskId);
      if (!task) {
        cleanupTimers.delete(taskId);
        return;
      }
      const next = elapsed + delta;
      cleanupTimers.set(taskId, next);
      const obstacle = demoCase.obstacles.find((candidate) => candidate.id === task.obstacleId)!;
      const current = options.store.getState();
      const aptitudeBonus = task.participantIds.some((id) => current.agents[id].personality === obstacle.preferredPersonality) ? 0.45 : 0;
      const averageFatigue = task.participantIds.reduce((sum, id) => sum + current.agents[id].fatigue, 0) / task.participantIds.length;
      const duration = 2.1 - aptitudeBonus - (task.participantIds.length - 1) * 0.3 + averageFatigue * 0.008;
      if (next >= duration) finishCleanup(task);
    });
  }

  async function finishInvestigation(agentId: AgentId, task: InvestigationTask, requestGeneration: number): Promise<void> {
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
      if (currentAgent.activeTask?.id !== task.id || currentAgent.mode !== "interacting" || response.result.task !== "encode_memory") return;

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
        sourceNpcIds: [npc.id],
        createdAt: Date.now(),
      };
      options.store.dispatch({
        type: "COMPLETE_INVESTIGATION",
        agentId,
        taskId: task.id,
        memory,
        slot: chooseMemorySlot(currentAgent),
        evidence,
        fatigue: task.autonomous ? 12 : 8,
      });
      interactionTimers.delete(task.id);
      if (task.topic === "jump") await judgeJumpLearning(agentId, memory, requestGeneration);
    } finally {
      pendingRequests.delete(task.id);
    }
  }

  async function judgeJumpLearning(agentId: AgentId, memory: Memory, requestGeneration: number): Promise<void> {
    const key = `${memory.id}-jump`;
    const agent = options.store.getState().agents[agentId];
    const response = await options.service.judgeJumpLearning({
      requestId: key,
      task: "judge_jump_learning",
      agent: { id: agent.id, personality: agent.personality },
      memories: agent.memories.filter((item): item is Memory => Boolean(item)),
    });
    if (requestGeneration !== generation || response.result.task !== "judge_jump_learning") return;
    const knowledge: JumpKnowledge = response.result.outcome;
    options.store.dispatch({
      type: "LEARN_JUMP",
      agentId,
      knowledge,
      evidence: {
        id: nextId("ability"),
        kind: "ability",
        agentIds: [agentId],
        topic: "jump",
        summary: response.result.spokenSummary,
        sourceLabel: response.source === "model" ? "AI 学习判断" : "本地学习判断",
        sourceNpcIds: ["grasshopper"],
        createdAt: Date.now(),
      },
    });
  }

  function finishCleanup(task: CleanupTask): void {
    if (pendingRequests.has(task.id)) return;
    pendingRequests.add(task.id);
    const obstacle = demoCase.obstacles.find((candidate) => candidate.id === task.obstacleId)!;
    options.store.dispatch({
      type: "COMPLETE_CLEANUP",
      taskId: task.id,
      obstacleId: task.obstacleId,
      agentIds: task.participantIds,
      inspiration: obstacle.reward,
      fatigue: task.participantIds.length === 2 ? 10 : 15,
      evidence: {
        id: nextId("cleanup-evidence"),
        kind: "cleanup",
        agentIds: task.participantIds,
        summary: `${task.participantIds.map((id) => options.store.getState().agents[id].name).join("和")}清理了${obstacle.name}`,
        sourceLabel: `环境任务 · +${obstacle.reward} 灵感`,
        createdAt: Date.now(),
      },
    });
    cleanupTimers.delete(task.id);
    pendingRequests.delete(task.id);
  }

  function recall(agentId: AgentId): boolean {
    const agent = options.store.getState().agents[agentId];
    if (!agent.activeTask) return false;
    interactionTimers.delete(agent.activeTask.id);
    cleanupTimers.delete(agent.activeTask.id);
    options.store.dispatch({ type: "RECALL_AGENT", agentId });
    return true;
  }

  function startDiscussion(firstId: AgentId, secondId: AgentId, topic: Topic): boolean {
    const state = options.store.getState();
    const firstMemories = state.agents[firstId].memories.filter(
      (memory): memory is Memory => Boolean(memory) && memory!.topic === topic,
    );
    const secondMemories = state.agents[secondId].memories.filter(
      (memory): memory is Memory => Boolean(memory) && memory!.topic === topic,
    );
    if (firstMemories.length === 0 || secondMemories.length === 0) return false;
    const discussion: DiscussionState = { id: nextId("discussion"), agentIds: [firstId, secondId], topic };
    options.store.dispatch({ type: "START_DISCUSSION", discussion });
    if (options.store.getState().discussion?.id !== discussion.id) return false;
    void finishDiscussion(discussion, [...firstMemories, ...secondMemories], generation);
    return true;
  }

  async function finishDiscussion(discussion: DiscussionState, memories: Memory[], requestGeneration: number): Promise<void> {
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
      if (requestGeneration !== generation || options.store.getState().discussion?.id !== discussion.id || response.result.task !== "reconcile_memories") return;
      const ownerByMemory = new Map<string, AgentId>();
      discussion.agentIds.forEach((agentId) => options.store.getState().agents[agentId].memories.forEach((item) => item && ownerByMemory.set(item.id, agentId)));
      const updates: MemoryUpdate[] = [];
      response.result.acceptedMemoryIds.forEach((memoryId) => {
        const agentId = ownerByMemory.get(memoryId);
        if (agentId) updates.push({ agentId, memoryId, confidence: "confirmed", reinforced: true });
      });
      response.result.questionedMemoryIds.forEach((memoryId) => {
        const agentId = ownerByMemory.get(memoryId);
        if (agentId) updates.push({ agentId, memoryId, confidence: "questioned", reinforced: false });
      });
      const sources = [...new Set(memories.map((item) => item.sourceNpcId))];
      options.store.dispatch({
        type: "COMPLETE_DISCUSSION",
        discussionId: discussion.id,
        updates,
        evidence: {
          id: nextId("evidence"),
          kind: "discussion",
          agentIds: [...discussion.agentIds],
          topic: discussion.topic,
          summary: response.result.spokenSummary,
          sourceLabel: response.source === "model" ? "AI 对证" : "本地对证",
          sourceNpcIds: sources,
          createdAt: Date.now(),
        },
      });
    } finally {
      pendingRequests.delete(discussion.id);
    }
  }

  function teachJump(teacherId: AgentId, studentId: AgentId): boolean {
    const before = options.store.getState();
    options.store.dispatch({
      type: "TEACH_JUMP",
      teacherId,
      studentId,
      evidence: {
        id: nextId("teach"),
        kind: "ability",
        agentIds: [teacherId, studentId],
        topic: "jump",
        summary: `${before.agents[teacherId].name}用自己的话重新演示了起跳时机`,
        sourceLabel: "同伴教学",
        sourceNpcIds: ["grasshopper"],
        createdAt: Date.now(),
      },
    });
    return options.store.getState().agents[studentId].jumpKnowledge === "learned";
  }

  function scoutGate(gateId: GateId): boolean {
    if (gateId !== "dragonfly-gap") return false;
    const state = options.store.getState();
    const scout = (Object.keys(state.agents) as AgentId[]).find((id) => state.agents[id].jumpKnowledge === "learned" && state.agents[id].mode === "following");
    if (!scout) return false;
    options.store.dispatch({ type: "MARK_GATE_SCOUTED", gateId });
    return startInvestigation([scout], "dragonfly", "source", true);
  }

  function upgradeMemory(agentId: AgentId): boolean {
    const before = options.store.getState().agents[agentId].memoryCapacity;
    options.store.dispatch({ type: "UPGRADE_MEMORY", agentId });
    return options.store.getState().agents[agentId].memoryCapacity > before;
  }

  function restSquad(): boolean {
    const before = options.store.getState();
    if (!before.atRestSpot) return false;
    options.store.dispatch({ type: "REST_SQUAD" });
    return true;
  }

  function chooseMother(frogId: FrogId): boolean {
    const state = options.store.getState();
    if (state.nearbyFrogId !== frogId || state.phase === "ending") return false;
    if (confirmedSourceCount(state) < 2) {
      options.store.dispatch({ type: "SET_OBJECTIVE", objective: "她只是温柔地看着你们。至少用两处独立证据对证后，才能确认妈妈" });
      return false;
    }
    options.store.dispatch({ type: "CHOOSE_MOTHER", frogId, correct: frogId === demoCase.motherId });
    return true;
  }

  function reset(): void {
    generation += 1;
    interactionTimers.clear();
    cleanupTimers.clear();
    pendingRequests.clear();
    options.store.dispatch({ type: "RESET_GAME" });
  }

  return {
    update,
    startInvestigation,
    arriveAtNpc,
    startCleanup,
    arriveAtObstacle,
    recall,
    startDiscussion,
    teachJump,
    scoutGate,
    upgradeMemory,
    restSquad,
    chooseMother,
    reset,
  };
}

function findCleanupTaskFromAgent(store: GameStore, taskId: string): CleanupTask | undefined {
  const agent = Object.values(store.getState().agents).find((candidate) => candidate.activeTask?.id === taskId);
  return agent?.activeTask?.type === "cleanup" ? agent.activeTask : undefined;
}

function topicLabel(topic: Topic): string {
  if (topic === "appearance") return "外貌";
  if (topic === "location") return "地点";
  if (topic === "source") return "来源";
  return "跳跃方法";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
