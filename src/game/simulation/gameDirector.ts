import type { AgentService } from "../../ai/agentService";
import type { EncodeMemoryResult } from "../../ai/contracts";
import type {
  AgentId,
  CleanupTask,
  DiscussionState,
  EvidenceEvent,
  Fact,
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
import { chooseMemorySlot, chooseMemoryToForget } from "../memory/memorySystem";
import { demoCase } from "../case/demoCase";
import type { CaseDefinition } from "../case/caseTypes";
import { confirmedSourceCount } from "../state/gameRules";
import type { GameStore } from "../state/gameStore";
import { evaluateConversationRisk } from "./conversationRisk";

export interface GameDirector {
  update(delta: number): void;
  startConversation(agentIds: AgentId[], npcId: NpcId): boolean;
  startInvestigation(agentIds: AgentId[], npcId: NpcId, topic: Topic, autonomous?: boolean): boolean;
  arriveAtNpc(agentId: AgentId, taskId: string): void;
  startCleanup(agentIds: AgentId[], obstacleId: ObstacleId): boolean;
  arriveAtObstacle(agentId: AgentId, taskId: string): void;
  recall(agentId: AgentId): boolean;
  startDiscussion(firstId: AgentId, secondId: AgentId, topic: Topic, autonomous?: boolean): boolean;
  teachJump(teacherId: AgentId, studentId: AgentId): boolean;
  scoutGate(gateId: GateId, agentId?: AgentId): boolean;
  finishGateJump(agentId: AgentId, taskId: string): void;
  finishGateReturn(agentId: AgentId, gateId: GateId): void;
  upgradeMemory(agentId: AgentId): boolean;
  restSquad(): boolean;
  chooseMother(frogId: FrogId): boolean;
  getTaskProgress(agentId: AgentId): AgentTaskProgress | undefined;
  abortAiActions(): void;
  reset(seed?: number): void;
}

export type AgentTaskProgress = Readonly<{
  kind: "dialogue" | "cleanup";
  label: string;
  value: number;
}>;

export function createGameDirector(options: { store: GameStore; service: AgentService; getCase?: () => CaseDefinition }): GameDirector {
  const interactionTimers = new Map<string, number>();
  const cleanupTimers = new Map<string, number>();
  const gateRoamTimers = new Map<string, number>();
  const pendingRequests = new Set<string>();
  const conversationCursor = new Map<NpcId, number>();
  const seenFacts = new Map<string, Set<string>>();
  const offeredFacts = new Map<string, Set<string>>();
  const clarifiedFacts = new Map<string, Set<string>>();
  const npcConversationHistory = new Map<NpcId, string[]>();
  const discussionHistory = new Map<string, string[]>();
  const pendingChatter = new Map<AgentId, string[]>();
  let sequence = 0;
  let generation = 0;
  let idleChatterElapsed = 0;
  let autonomousDiscussionElapsed = 0;
  let memoryDecayElapsed = 0;
  let chatterSequence = 0;

  const currentCase = (): CaseDefinition => options.getCase?.() ?? demoCase;

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function startConversation(agentIds: AgentId[], npcId: NpcId): boolean {
    const state = options.store.getState();
    const npc = currentCase().npcs.find((candidate) => candidate.id === npcId);
    const participants = [...new Set(agentIds)].filter((id) => state.agents[id].mode === "following" && state.agents[id].fatigue < 90);
    if (!npc || participants.length === 0) return false;

    const cursor = conversationCursor.get(npcId) ?? 0;
    const rankedTopics = npc.topics.map((topic, index) => ({
      topic,
      index,
      remembered: participants.reduce(
        (count, agentId) => count + state.agents[agentId].memories.filter((memory) => memory?.sourceNpcId === npcId && memory.topic === topic).length,
        0,
      ),
      order: (index - cursor + npc.topics.length) % npc.topics.length,
    }));
    rankedTopics.sort((left, right) => left.remembered - right.remembered || left.order - right.order);
    const selected = rankedTopics[0];
    if (!selected) return false;
    conversationCursor.set(npcId, (selected.index + 1) % npc.topics.length);
    return startInvestigation(participants, npcId, selected.topic);
  }

  function startInvestigation(
    agentIds: AgentId[],
    npcId: NpcId,
    topic: Topic,
    autonomous = false,
  ): boolean {
    const state = options.store.getState();
    const npc = currentCase().npcs.find((candidate) => candidate.id === npcId);
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
      objective: autonomous ? `${names}根据性格主动去接近${npc.name}` : `${names}正在前往${npc.name}调查${topicLabel(topic)}`,
    });
    if (autonomous) {
      participants.forEach((agentId) => speak(agentId, `我对${npc.name}有点好奇，先去问问！`, "autonomous", 5_000));
    }
    return true;
  }

  function arriveAtNpc(agentId: AgentId, taskId: string): void {
    const agent = options.store.getState().agents[agentId];
    if (agent.activeTask?.id !== taskId || agent.activeTask.type !== "investigation" || agent.mode !== "approaching") return;
    interactionTimers.set(taskId, 0);
    options.store.dispatch({ type: "BEGIN_INTERACTION", agentId, taskId });
    const target = currentCase().npcs.find((candidate) => candidate.id === (agent.activeTask as InvestigationTask).npcId);
    options.store.dispatch({ type: "SET_OBJECTIVE", objective: `${agent.name}正在和${target?.name ?? "目击者"}交谈，你听不见它们说什么` });
  }

  function startCleanup(agentIds: AgentId[], obstacleId: ObstacleId): boolean {
    const obstacle = currentCase().obstacles.find((candidate) => candidate.id === obstacleId);
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
      if (!task || task.type !== "investigation" || !task.viaGateId || agent.mode !== "considering") return;
      const elapsed = (gateRoamTimers.get(task.id) ?? 0) + delta;
      gateRoamTimers.set(task.id, elapsed);
      if (elapsed < 1.65) return;
      options.store.dispatch({ type: "RESUME_INVESTIGATION", agentId: agent.id, taskId: task.id });
      gateRoamTimers.delete(task.id);
      options.store.dispatch({ type: "SET_OBJECTIVE", objective: `${agent.name}发现了旅行蜻蜓，正过去和它交谈` });
    });
    Object.values(state.agents).forEach((agent) => {
      const task = agent.activeTask;
      if (!task || task.type !== "investigation" || agent.mode !== "interacting") return;
      const elapsed = (interactionTimers.get(task.id) ?? 0) + delta;
      interactionTimers.set(task.id, elapsed);
      if (elapsed >= 1.15) void finishInvestigation(agent.id, task, generation).catch(() => undefined);
    });

    cleanupTimers.forEach((elapsed, taskId) => {
      const task = findCleanupTaskFromAgent(options.store, taskId);
      if (!task) {
        cleanupTimers.delete(taskId);
        return;
      }
      const next = elapsed + delta;
      cleanupTimers.set(taskId, next);
      const obstacle = currentCase().obstacles.find((candidate) => candidate.id === task.obstacleId)!;
      const current = options.store.getState();
      const aptitudeBonus = task.participantIds.some((id) => current.agents[id].personality === obstacle.preferredPersonality) ? 0.45 : 0;
      const averageFatigue = task.participantIds.reduce((sum, id) => sum + current.agents[id].fatigue, 0) / task.participantIds.length;
      const duration = cleanupDuration(task, aptitudeBonus, averageFatigue);
      if (next >= duration) finishCleanup(task);
    });

    const updatedState = options.store.getState();
    if (!updatedState.candidateFrogsRevealed && confirmedSourceCount(updatedState) >= 2) {
      options.store.dispatch({ type: "REVEAL_CANDIDATE_FROGS" });
    }
    if (updatedState.phase !== "explore") return;
    memoryDecayElapsed += delta;
    idleChatterElapsed += delta;
    autonomousDiscussionElapsed += delta;
    if (memoryDecayElapsed >= 15) {
      memoryDecayElapsed = 0;
      options.store.dispatch({ type: "DECAY_MEMORIES", amount: 5 });
    }
    if (idleChatterElapsed >= 8 + (sequence % 5)) {
      idleChatterElapsed = 0;
      emitIdleChatter();
    }
    if (autonomousDiscussionElapsed >= 18) {
      autonomousDiscussionElapsed = 0;
      tryStartAutonomousDiscussion();
    }
  }

  async function finishInvestigation(agentId: AgentId, task: InvestigationTask, requestGeneration: number): Promise<void> {
    if (pendingRequests.has(task.id)) return;
    pendingRequests.add(task.id);
    const state = options.store.getState();
    const agent = state.agents[agentId];
    const npc = currentCase().npcs.find((candidate) => candidate.id === task.npcId)!;
    const agentNpcKey = `${agentId}:${npc.id}`;
    const offeredKey = `${npc.id}:${task.topic}`;
    const known = seenFacts.get(agentNpcKey) ?? new Set<string>();
    seenFacts.set(agentNpcKey, known);
    const offered = offeredFacts.get(offeredKey) ?? new Set<string>();
    offeredFacts.set(offeredKey, offered);
    const clarified = clarifiedFacts.get(agentNpcKey) ?? new Set<string>();
    clarifiedFacts.set(agentNpcKey, clarified);
    const selection = selectConversationFact(npc.facts, task.topic, agent.memories, known, offered, clarified);

    try {
      if (task.topic === "jump") {
        const jumpAgent = options.store.getState().agents[agentId];
        if (jumpAgent.activeTask?.id !== task.id || jumpAgent.mode !== "interacting") return;
        options.store.dispatch({
          type: "COMPLETE_JUMP_TRAINING",
          agentId,
          taskId: task.id,
          evidence: {
            id: nextId("ability"),
            kind: "ability",
            agentIds: [agentId],
            topic: "jump",
            summary: `${jumpAgent.name}跟着${npc.name}练了起跳`,
            sourceLabel: `${npc.name} · 跳跃练习`,
            sourceNpcIds: [npc.id],
            createdAt: Date.now(),
          },
          fatigue: task.autonomous ? 10 : 6,
        });
        if (task.viaGateId) options.store.dispatch({ type: "MARK_GATE_SCOUTED", gateId: task.viaGateId });
        interactionTimers.delete(task.id);
        await judgeJumpLearning(agentId, npc.id, requestGeneration);
        return;
      }
      if (!selection) {
        const summary = `${agent.name}继续问了一会儿，但${npc.name}已经没有新的线索了`;
        options.store.dispatch({
          type: "FAIL_INVESTIGATION",
          agentId,
          taskId: task.id,
          evidence: {
            id: nextId("finished-conversation"),
            kind: "investigation",
            agentIds: [agentId],
            topic: task.topic,
            summary,
            sourceLabel: `${npc.name} · 已问完`,
            sourceNpcIds: [npc.id],
            createdAt: Date.now(),
          },
          fatigue: 4,
        });
        interactionTimers.delete(task.id);
        speak(agentId, "这部分好像已经问清楚了。", "autonomous", 4_000);
        return;
      }
      offered.add(selection.fact.id);
      const response = await options.service.encodeMemory({
        requestId: task.id,
        task: "encode_memory",
        agent: {
          id: agent.id,
          personality: agent.personality,
          communicationStyle: agent.communicationStyle,
          fatigue: agent.fatigue,
          hiddenProfile: agent.hiddenProfile,
        },
        npc: { id: npc.id, name: npc.name },
        topic: task.topic,
        allowedFacts: [selection.fact],
        memories: [...agent.memories],
        conversationHistory: [...(npcConversationHistory.get(npc.id) ?? [])],
        seenFactIds: [...known],
        turnIndex: (npcConversationHistory.get(npc.id) ?? []).length,
      });
      if (requestGeneration !== generation) return;
      const currentAgent = options.store.getState().agents[agentId];
      if (currentAgent.activeTask?.id !== task.id || currentAgent.mode !== "interacting" || response.result.task !== "encode_memory") return;

      const conversationOutcome = evaluateConversationRisk(currentAgent, npc, task.id, state.sessionSeed);
      if (conversationOutcome !== "memory") {
        const forgotten = conversationOutcome === "panic" ? chooseMemoryToForget(currentAgent) : undefined;
        const summary = conversationOutcome === "panic"
          ? forgotten
            ? `${currentAgent.name}被这次交谈吓了一跳，连“${shorten(forgotten.summary, 18)}”也想不起来了`
            : `${currentAgent.name}被这次交谈吓了一跳，什么也没能记住`
          : `${currentAgent.name}和${npc.name}聊过了，但没能带回一条可靠记忆`;
        options.store.dispatch({
          type: "FAIL_INVESTIGATION",
          agentId,
          taskId: task.id,
          forgetMemoryId: forgotten?.id,
          evidence: {
            id: nextId("failed-investigation"),
            kind: "investigation",
            agentIds: [agentId],
            topic: task.topic,
            summary,
            sourceLabel: `${npc.name} · ${conversationOutcome === "panic" ? "受到惊吓" : "没有有效收获"}`,
            sourceNpcIds: [npc.id],
            createdAt: Date.now(),
          },
          fatigue: conversationOutcome === "panic" ? 16 : 10,
        });
        interactionTimers.delete(task.id);
        speak(
          agentId,
          conversationOutcome === "panic" ? "我不想再想刚才的事了……脑子里空了一块。" : "我好像听见了什么，但一句也没抓住。",
          conversationOutcome === "panic" ? "tired" : "autonomous",
          5_000,
        );
        return;
      }

      const encodedMemory = normalizeEncodedMemory([selection.fact], response.result);
      if (!encodedMemory) return;

      const memory: Memory = {
        id: nextId("memory"),
        factIds: [encodedMemory.fact.id],
        topic: task.topic,
        summary: encodedMemory.summary,
        rememberedSource: npc.name,
        sourceNpcId: npc.id,
        sourceNpcIds: [npc.id],
        emotion: response.result.tone,
        confidence: "believed",
        fidelity: response.result.fidelity,
        transmission: "direct",
        strength: 100,
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
      const existingSlot = currentAgent.memories.findIndex((item) => (
        item?.sourceNpcId === npc.id && item.factIds.includes(encodedMemory.fact.id)
      ));
      options.store.dispatch({
        type: "COMPLETE_INVESTIGATION",
        agentId,
        taskId: task.id,
        memory,
        slot: existingSlot >= 0 ? existingSlot : chooseMemorySlot(currentAgent),
        evidence,
        fatigue: task.autonomous ? 12 : 8,
      });
      known.add(encodedMemory.fact.id);
      if (selection.kind === "clarify") clarified.add(encodedMemory.fact.id);
      const history = npcConversationHistory.get(npc.id) ?? [];
      history.push(`${currentAgent.name}记成了：${memory.summary}`);
      npcConversationHistory.set(npc.id, history.slice(-6));
      if (response.result.afterthought) {
        const lines = pendingChatter.get(agentId) ?? [];
        lines.push(response.result.afterthought);
        pendingChatter.set(agentId, lines.slice(-3));
      }
      if (task.viaGateId) options.store.dispatch({ type: "MARK_GATE_SCOUTED", gateId: task.viaGateId });
      interactionTimers.delete(task.id);
    } finally {
      pendingRequests.delete(task.id);
    }
  }

  async function judgeJumpLearning(agentId: AgentId, sourceNpcId: NpcId, requestGeneration: number): Promise<void> {
    const key = `jump-${agentId}-${requestGeneration}`;
    const agent = options.store.getState().agents[agentId];
    const response = await options.service.judgeJumpLearning({
      requestId: key,
      task: "judge_jump_learning",
      agent: {
        id: agent.id,
        personality: agent.personality,
        hiddenProfile: agent.hiddenProfile,
      },
      trainingSourceNpcId: sourceNpcId,
      trainingSummary: currentCase().npcs
        .find((npc) => npc.id === sourceNpcId)?.facts
        .find((fact) => fact.topic === "jump")?.value ?? "跟着河边的朋友练习了起跳时机",
      memories: agent.memories.filter((item): item is Memory => Boolean(item)),
    });
    if (requestGeneration !== generation || response.result.task !== "judge_jump_learning") return;
    const knowledge: JumpKnowledge = response.result.outcome;
    if (agent.jumpKnowledge === knowledge) return;
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
        sourceNpcIds: [sourceNpcId],
        createdAt: Date.now(),
      },
    });
    if (knowledge === "learned") speak(agentId, "我学会跳跃了！", "autonomous", 5_000);
  }

  function finishCleanup(task: CleanupTask): void {
    if (pendingRequests.has(task.id)) return;
    pendingRequests.add(task.id);
    const obstacle = currentCase().obstacles.find((candidate) => candidate.id === task.obstacleId)!;
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
    if (!agent.activeTask) {
      if (agent.mode !== "following" && agent.mode !== "tired") return false;
      options.store.dispatch({ type: "RECALL_AGENT", agentId });
      return options.store.getState().agents[agentId].mode === "returning";
    }
    interactionTimers.delete(agent.activeTask.id);
    cleanupTimers.delete(agent.activeTask.id);
    options.store.dispatch({ type: "RECALL_AGENT", agentId });
    return true;
  }

  function startDiscussion(firstId: AgentId, secondId: AgentId, topic: Topic, autonomous = false): boolean {
    const state = options.store.getState();
    const firstMemories = state.agents[firstId].memories.filter(
      (memory): memory is Memory => Boolean(memory) && memory!.topic === topic,
    );
    const secondMemories = state.agents[secondId].memories.filter(
      (memory): memory is Memory => Boolean(memory) && memory!.topic === topic,
    );
    if (firstMemories.length === 0 || secondMemories.length === 0) return false;
    const discussion: DiscussionState = { id: nextId("discussion"), agentIds: [firstId, secondId], topic, autonomous };
    options.store.dispatch({ type: "START_DISCUSSION", discussion });
    if (options.store.getState().discussion?.id !== discussion.id) return false;
    if (autonomous) {
      speak(firstId, "我想起一件事，我们对一对？", "peer", 5_000);
      speak(secondId, "好呀，但别把猜测当成亲眼看见。", "peer", 5_000);
    }
    void finishDiscussion(discussion, [...firstMemories, ...secondMemories], generation).catch(() => undefined);
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
          hiddenProfiles: [state.agents[firstId].hiddenProfile, state.agents[secondId].hiddenProfile],
          discussionHistory: [...(discussionHistory.get(discussionKey(discussion)) ?? [])],
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
      const historyKey = discussionKey(discussion);
      const previousDiscussion = discussionHistory.get(historyKey) ?? [];
      previousDiscussion.push(response.result.spokenSummary);
      discussionHistory.set(historyKey, previousDiscussion.slice(-4));
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
      if (sources.length > 1 && response.result.outcome !== "reinforce") {
        const receiverId = discussion.agentIds[1];
        const receiver = options.store.getState().agents[receiverId];
        const mixedMemory: Memory = {
          id: nextId("mixed-memory"),
          factIds: [...new Set(memories.flatMap((item) => item.factIds))],
          topic: discussion.topic,
          summary: response.result.spokenSummary,
          rememberedSource: "同伴拼接",
          sourceNpcId: sources[0]!,
          sourceNpcIds: sources,
          emotion: "calm",
          confidence: "questioned",
          fidelity: "compressed",
          transmission: "mixed",
          strength: 72,
          createdAt: Date.now(),
          reinforced: false,
          parentMemoryIds: memories.map((item) => item.id),
          resultSource: response.source,
        };
        options.store.dispatch({
          type: "STORE_MEMORY",
          agentId: receiverId,
          memory: mixedMemory,
          slot: chooseMemorySlot(receiver),
        });
      }
      // Jump is a skill rather than a memory topic, but talking it through with
      // a companion who has already mastered it can complete a partly-learned
      // jump — so other conversations can also teach the skill.
      discussion.agentIds.forEach((agentId) => {
        const agent = options.store.getState().agents[agentId];
        if (agent.jumpKnowledge !== "partial") return;
        const partnerId = discussion.agentIds.find((id) => id !== agentId)!;
        const partner = options.store.getState().agents[partnerId];
        if (partner.jumpKnowledge !== "learned") return;
        options.store.dispatch({
          type: "LEARN_JUMP",
          agentId,
          knowledge: "learned",
          evidence: {
            id: nextId("ability"),
            kind: "ability",
            agentIds: [...discussion.agentIds],
            topic: "jump",
            summary: `${agent.name}听${partner.name}讲明白起跳时机，学会了跳跃`,
            sourceLabel: "同伴对证学习",
            createdAt: Date.now(),
          },
        });
        speak(agentId, "我学会跳跃了！", "autonomous", 5_000);
      });
    } finally {
      pendingRequests.delete(discussion.id);
    }
  }

  function speak(
    agentId: AgentId,
    text: string,
    kind: "idle" | "autonomous" | "peer" | "tired",
    durationMs = 4_200,
  ): void {
    options.store.dispatch({
      type: "SET_AGENT_UTTERANCE",
      agentId,
      utterance: { text, kind, expiresAt: Date.now() + durationMs },
    });
  }

  function emitIdleChatter(): void {
    const state = options.store.getState();
    const available = (Object.keys(state.agents) as AgentId[]).filter((id) => {
      const agent = state.agents[id];
      return agent.mode === "following" || agent.mode === "tired";
    });
    const agentId = available[chatterSequence % Math.max(available.length, 1)];
    if (!agentId) return;
    chatterSequence += 1;
    const agent = state.agents[agentId];
    const queuedLine = pendingChatter.get(agentId)?.shift();
    if (queuedLine) {
      speak(agentId, queuedLine, "idle");
      return;
    }
    const memory = agent.memories.filter((item): item is Memory => Boolean(item)).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (agent.fatigue >= 70) {
      speak(agentId, "我有点累，刚才的话好像开始记不清了……", "tired");
      return;
    }
    if (!memory) {
      const line = agent.personality === "impulsive"
        ? "前面一定有新鲜事，我想先去看看！"
        : agent.personality === "social"
          ? "你们有想起关于妈妈的什么吗？"
          : "我先把看到的顺序理一理。";
      speak(agentId, line, "idle");
      return;
    }
    const line = agent.communicationStyle === "embellishing"
      ? `我敢肯定这条线索很重要——${shorten(memory.summary, 24)}`
      : agent.communicationStyle === "agreeable"
        ? `我记成了“${shorten(memory.summary, 22)}”，你们也是吗？`
        : `先别下结论；这是${memory.rememberedSource}说的：${shorten(memory.summary, 22)}`;
    speak(agentId, line, "idle");
  }

  function tryStartAutonomousDiscussion(): void {
    const state = options.store.getState();
    if (state.discussion) return;
    const available = (Object.keys(state.agents) as AgentId[]).filter((id) => {
      const agent = state.agents[id];
      return agent.mode === "following" && agent.fatigue < 70;
    });
    for (let firstIndex = 0; firstIndex < available.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < available.length; secondIndex += 1) {
        const firstId = available[firstIndex]!;
        const secondId = available[secondIndex]!;
        const firstTopics = new Set(state.agents[firstId].memories.flatMap((memory) => memory ? [memory.topic] : []));
        const topic = state.agents[secondId].memories.flatMap((memory) => memory ? [memory.topic] : []).find((item) => firstTopics.has(item));
        if (topic && startDiscussion(firstId, secondId, topic, true)) return;
      }
    }
    if (available.length >= 2) {
      const [firstId, secondId] = available;
      speak(firstId!, "你还记得我们为什么出发吗？", "peer", 5_000);
      speak(secondId!, "记得呀，不过我更想听听你刚才注意到了什么。", "peer", 5_000);
      options.store.dispatch({ type: "ADD_FATIGUE", agentIds: [firstId!, secondId!], amount: 1, reason: "conversation" });
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

  function scoutGate(gateId: GateId, agentId?: AgentId): boolean {
    if (gateId !== "dragonfly-gap" || !agentId) return false;
    const state = options.store.getState();
    const scout = state.agents[agentId];
    if (state.scoutedGateIds.includes(gateId) || scout.jumpKnowledge !== "learned" || scout.mode !== "following" || scout.fatigue >= 90) return false;
    const task: InvestigationTask = {
      type: "investigation",
      id: nextId("gate-scout"),
      npcId: "dragonfly",
      topic: "source",
      autonomous: false,
      viaGateId: gateId,
    };
    options.store.dispatch({ type: "START_GATE_SCOUT", agentId, task, gateId });
    if (options.store.getState().agents[agentId].activeTask?.id !== task.id) return false;
    options.store.dispatch({ type: "SET_OBJECTIVE", objective: `${scout.name}正在越过叶隙侦察` });
    speak(agentId, "我跳过去看看，你们在这边等我！", "autonomous", 4_500);
    return true;
  }

  function finishGateJump(agentId: AgentId, taskId: string): void {
    const agent = options.store.getState().agents[agentId];
    if (agent.mode !== "jumping" || agent.activeTask?.id !== taskId) return;
    options.store.dispatch({ type: "FINISH_GATE_JUMP", agentId, taskId });
    if (options.store.getState().agents[agentId].mode !== "considering") return;
    gateRoamTimers.set(taskId, 0);
    options.store.dispatch({ type: "SET_OBJECTIVE", objective: `${agent.name}跳过了叶隙，正在对岸自由观察` });
  }

  function finishGateReturn(agentId: AgentId, gateId: GateId): void {
    options.store.dispatch({ type: "FINISH_GATE_RETURN", agentId, gateId });
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
    if (!state.candidateFrogsRevealed || state.nearbyFrogId !== frogId || state.phase === "ending") return false;
    if (confirmedSourceCount(state) < 2) {
      options.store.dispatch({ type: "SET_OBJECTIVE", objective: "她只是温柔地看着你们。至少用两处独立证据对证后，才能确认妈妈" });
      return false;
    }
    options.store.dispatch({ type: "CHOOSE_MOTHER", frogId, correct: frogId === currentCase().motherId });
    return true;
  }

  function getTaskProgress(agentId: AgentId): AgentTaskProgress | undefined {
    const state = options.store.getState();
    const agent = state.agents[agentId];
    const task = agent.activeTask;
    if (!task) return undefined;
    if (task.type === "investigation") {
      if (agent.mode === "jumping") return { kind: "dialogue", label: "越过叶隙", value: 0.12 };
      if (agent.mode === "considering") return { kind: "dialogue", label: "对岸观察", value: 0.28 };
      const value = agent.mode === "approaching"
        ? task.viaGateId ? 0.4 : 0.06
        : 0.4 + clamp01((interactionTimers.get(task.id) ?? 0) / 1.15) * 0.6;
      return { kind: "dialogue", label: agent.mode === "approaching" ? "去聊天" : value >= 1 ? "记住中" : "聊天中", value };
    }
    const obstacle = currentCase().obstacles.find((candidate) => candidate.id === task.obstacleId);
    if (!obstacle) return undefined;
    const aptitudeBonus = task.participantIds.some((id) => state.agents[id].personality === obstacle.preferredPersonality) ? 0.45 : 0;
    const averageFatigue = task.participantIds.reduce((sum, id) => sum + state.agents[id].fatigue, 0) / task.participantIds.length;
    const duration = cleanupDuration(task, aptitudeBonus, averageFatigue);
    const value = agent.mode === "approaching" ? 0.06 : clamp01((cleanupTimers.get(task.id) ?? 0) / duration);
    return { kind: "cleanup", label: agent.mode === "approaching" ? "去清理" : "清理中", value };
  }

  function reset(seed?: number): void {
    generation += 1;
    interactionTimers.clear();
    cleanupTimers.clear();
    gateRoamTimers.clear();
    pendingRequests.clear();
    conversationCursor.clear();
    seenFacts.clear();
    offeredFacts.clear();
    clarifiedFacts.clear();
    npcConversationHistory.clear();
    discussionHistory.clear();
    pendingChatter.clear();
    idleChatterElapsed = 0;
    autonomousDiscussionElapsed = 0;
    memoryDecayElapsed = 0;
    chatterSequence = 0;
    options.store.dispatch({ type: "RESET_GAME", seed });
  }

  function abortAiActions(): void {
    generation += 1;
    interactionTimers.clear();
    pendingRequests.clear();
    options.store.dispatch({ type: "CANCEL_AI_ACTIONS" });
  }

  return {
    update,
    startConversation,
    startInvestigation,
    arriveAtNpc,
    startCleanup,
    arriveAtObstacle,
    recall,
    startDiscussion,
    teachJump,
    scoutGate,
    finishGateJump,
    finishGateReturn,
    upgradeMemory,
    restSquad,
    chooseMother,
    getTaskProgress,
    abortAiActions,
    reset,
  };
}

function cleanupDuration(
  task: CleanupTask,
  aptitudeBonus: number,
  averageFatigue: number,
): number {
  return 2.1 - aptitudeBonus - (task.participantIds.length - 1) * 0.3 + averageFatigue * 0.008;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function findCleanupTaskFromAgent(store: GameStore, taskId: string): CleanupTask | undefined {
  const agent = Object.values(store.getState().agents).find((candidate) => candidate.activeTask?.id === taskId);
  return agent?.activeTask?.type === "cleanup" ? agent.activeTask : undefined;
}

function selectAvailableFacts(
  facts: readonly Fact[],
  topic: Topic,
  memories: ReadonlyArray<Memory | null>,
  seen: ReadonlySet<string>,
): Fact[] {
  const knownFactIds = new Set([...seen, ...memories.flatMap((memory) => memory?.factIds ?? [])]);
  const topicFacts = facts.filter((fact) => fact.topic === topic);
  const conditional = topicFacts.filter(
    (fact) => fact.requiresAnyFactIds?.some((factId) => knownFactIds.has(factId)),
  );
  const available = conditional.length > 0 ? conditional : topicFacts.filter((fact) => !fact.requiresAnyFactIds);
  return available;
}

function selectConversationFact(
  facts: readonly Fact[],
  topic: Topic,
  memories: ReadonlyArray<Memory | null>,
  seen: ReadonlySet<string>,
  offered: Set<string>,
  clarified: ReadonlySet<string>,
): { fact: Fact; kind: "new" | "clarify" | "refresh" } | undefined {
  const available = selectAvailableFacts(facts, topic, memories, seen);
  const unseen = available.filter((fact) => !seen.has(fact.id));
  if (unseen.length > 0) {
    let fact = unseen.find((candidate) => !offered.has(candidate.id));
    if (!fact) {
      offered.clear();
      fact = unseen[0];
    }
    return fact ? { fact, kind: "new" } : undefined;
  }

  const currentFactIds = new Set(memories.flatMap((memory) => memory?.factIds ?? []));
  const clarification = available.find((fact) => currentFactIds.has(fact.id) && !clarified.has(fact.id));
  if (clarification) return { fact: clarification, kind: "clarify" };
  const refresh = available.find((fact) => !currentFactIds.has(fact.id));
  return refresh ? { fact: refresh, kind: "refresh" } : undefined;
}

function normalizeEncodedMemory(
  allowedFacts: readonly Fact[],
  result: EncodeMemoryResult,
): { fact: Fact; summary: string } | undefined {
  const selectedId = result.selectedFactIds[0];
  const selectedFact = allowedFacts.find((fact) => fact.id === selectedId);
  const fact = selectedFact ?? allowedFacts[0];
  if (!fact) return undefined;
  return {
    fact,
    summary: result.spokenSummary,
  };
}

function discussionKey(discussion: DiscussionState): string {
  return `${[...discussion.agentIds].sort().join(":")}:${discussion.topic}`;
}

function shorten(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
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
