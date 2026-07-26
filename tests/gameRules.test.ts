import { describe, expect, it } from "vitest";
import type { CleanupTask, EvidenceEvent, InvestigationTask, Memory } from "../src/core/types";
import { confirmedSourceCount, reduceGameState } from "../src/game/state/gameRules";
import { createInitialGameState } from "../src/game/state/gameState";

const task: InvestigationTask = {
  type: "investigation",
  id: "task-1",
  npcId: "dragonfly",
  topic: "appearance",
  autonomous: false,
};

const learnedMemory: Memory = {
  id: "memory-1",
  factIds: ["dragonfly-appearance"],
  topic: "appearance",
  summary: "红脚蓝背",
  rememberedSource: "旅行蜻蜓",
  sourceNpcId: "dragonfly",
  sourceNpcIds: ["dragonfly"],
  emotion: "excited",
  confidence: "believed",
  fidelity: "compressed",
  transmission: "direct",
  strength: 100,
  createdAt: 1,
  reinforced: false,
  resultSource: "fallback",
};

const evidence: EvidenceEvent = {
  id: "evidence-1",
  kind: "investigation",
  agentIds: ["xiaolang"],
  topic: "appearance",
  summary: learnedMemory.summary,
  sourceLabel: "旅行蜻蜓",
  sourceNpcIds: ["dragonfly"],
  createdAt: 1,
};

describe("game rules", () => {
  it("runs a selected gate scout through jump, observation, dialogue, and return", () => {
    const gateTask: InvestigationTask = {
      type: "investigation",
      id: "gate-scout-1",
      npcId: "dragonfly",
      topic: "source",
      autonomous: false,
      viaGateId: "dragonfly-gap",
    };
    let state = createInitialGameState();
    state.agents.xiaolang.jumpKnowledge = "learned";
    state = reduceGameState(state, { type: "START_GATE_SCOUT", agentId: "xiaolang", task: gateTask, gateId: "dragonfly-gap" });
    expect(state.agents.xiaolang.mode).toBe("jumping");
    state = reduceGameState(state, { type: "FINISH_GATE_JUMP", agentId: "xiaolang", taskId: gateTask.id });
    expect(state.agents.xiaolang.mode).toBe("considering");
    state = reduceGameState(state, { type: "RESUME_INVESTIGATION", agentId: "xiaolang", taskId: gateTask.id });
    expect(state.agents.xiaolang.mode).toBe("approaching");
    state = reduceGameState(state, { type: "BEGIN_INTERACTION", agentId: "xiaolang", taskId: gateTask.id });
    state = reduceGameState(state, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: gateTask.id,
      memory: learnedMemory,
      slot: 0,
      evidence,
      fatigue: 8,
    });
    expect(state.agents.xiaolang.mode).toBe("returning");
    expect(state.agents.xiaolang.returnGateId).toBe("dragonfly-gap");
    state = reduceGameState(state, { type: "FINISH_GATE_RETURN", agentId: "xiaolang", gateId: "dragonfly-gap" });
    expect(state.agents.xiaolang.returnGateId).toBeUndefined();
  });

  it("keeps a primary agent while storing a box-selected squad", () => {
    const state = reduceGameState(createInitialGameState(), {
      type: "SELECT_AGENTS",
      agentIds: ["paopao", "modian", "paopao"],
    });

    expect(state.selectedAgentIds).toEqual(["paopao", "modian"]);
    expect(state.selectedAgentId).toBe("paopao");
  });

  it("completes an investigation once without a global action budget", () => {
    let state = createInitialGameState();
    state = reduceGameState(state, { type: "START_INVESTIGATION", agentId: "xiaolang", task });
    state = reduceGameState(state, { type: "BEGIN_INTERACTION", agentId: "xiaolang", taskId: task.id });
    state = reduceGameState(state, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      memory: learnedMemory,
      slot: 0,
      evidence,
      fatigue: 8,
    });

    expect(state.agents.xiaolang.memories[0]?.id).toBe("memory-1");
    expect(state.agents.xiaolang.fatigue).toBe(8);
    expect(state.evidenceLog).toHaveLength(1);
    expect(state.agents.xiaolang.mode).toBe("returning");

    const duplicate = reduceGameState(state, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      memory: learnedMemory,
      slot: 1,
      evidence,
      fatigue: 8,
    });
    expect(duplicate).toBe(state);
  });

  it("can end a frightening conversation without a new memory and forget an old one", () => {
    let state = createInitialGameState();
    state.agents.xiaolang.memories[0] = learnedMemory;
    state = reduceGameState(state, { type: "START_INVESTIGATION", agentId: "xiaolang", task });
    state = reduceGameState(state, { type: "BEGIN_INTERACTION", agentId: "xiaolang", taskId: task.id });
    state = reduceGameState(state, {
      type: "FAIL_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      forgetMemoryId: learnedMemory.id,
      evidence: { ...evidence, id: "fear-evidence", summary: "受到惊吓，忘掉了旧记忆" },
      fatigue: 16,
    });
    expect(state.agents.xiaolang.memories[0]).toBeNull();
    expect(state.agents.xiaolang.mode).toBe("returning");
    expect(state.agents.xiaolang.fatigue).toBe(16);
    expect(state.evidenceLog.at(-1)?.summary).toBe("受到惊吓，忘掉了旧记忆");
  });

  it("ignores a late AI result after recall or ending", () => {
    let state = createInitialGameState();
    state = reduceGameState(state, { type: "START_INVESTIGATION", agentId: "xiaolang", task });
    state = reduceGameState(state, { type: "BEGIN_INTERACTION", agentId: "xiaolang", taskId: task.id });
    state = reduceGameState(state, { type: "RECALL_AGENT", agentId: "xiaolang" });
    const afterRecall = reduceGameState(state, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      memory: learnedMemory,
      slot: 0,
      evidence,
      fatigue: 8,
    });
    expect(afterRecall).toBe(state);

    let endingState = createInitialGameState();
    endingState.candidateFrogsRevealed = true;
    endingState = reduceGameState(endingState, { type: "START_INVESTIGATION", agentId: "xiaolang", task });
    endingState = reduceGameState(endingState, { type: "BEGIN_INTERACTION", agentId: "xiaolang", taskId: task.id });
    endingState = reduceGameState(endingState, { type: "CHOOSE_MOTHER", frogId: "marsh-frog", correct: true });
    const afterEnding = reduceGameState(endingState, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      memory: learnedMemory,
      slot: 0,
      evidence,
      fatigue: 8,
    });
    expect(afterEnding).toBe(endingState);
  });

  it("clears an obstacle once, rewards inspiration, and upgrades one agent memory", () => {
    const cleanup: CleanupTask = {
      type: "cleanup",
      id: "cleanup-1",
      obstacleId: "driftwood-jam",
      participantIds: ["xiaolang", "paopao"],
    };
    let state = createInitialGameState();
    state = reduceGameState(state, { type: "START_CLEANUP", task: cleanup });
    state = reduceGameState(state, { type: "BEGIN_WORK", agentId: "xiaolang", taskId: cleanup.id });
    state = reduceGameState(state, { type: "BEGIN_WORK", agentId: "paopao", taskId: cleanup.id });
    state = reduceGameState(state, {
      type: "COMPLETE_CLEANUP",
      taskId: cleanup.id,
      obstacleId: cleanup.obstacleId,
      agentIds: cleanup.participantIds,
      inspiration: 2,
      fatigue: 10,
      evidence: { ...evidence, id: "cleanup-evidence", kind: "cleanup", agentIds: cleanup.participantIds },
    });
    expect(state.inspiration).toBe(2);
    expect(state.clearedObstacleIds).toEqual(["driftwood-jam"]);
    expect(state.agents.xiaolang.fatigue).toBe(10);

    state = reduceGameState(state, { type: "UPGRADE_MEMORY", agentId: "modian" });
    expect(state.inspiration).toBe(0);
    expect(state.agents.modian.memoryCapacity).toBe(4);
    expect(state.agents.modian.memories).toHaveLength(4);
  });

  it("tracks two confirmed independent sources after discussion", () => {
    let state = createInitialGameState();
    state.agents.xiaolang.memories[0] = { ...learnedMemory, id: "turtle-memory", sourceNpcId: "turtle", confidence: "confirmed" };
    state.agents.modian.memories[0] = { ...learnedMemory, id: "crab-memory", sourceNpcId: "crab", confidence: "confirmed" };
    expect(confirmedSourceCount(state)).toBe(2);
  });

  it("reveals candidate frogs only after two confirmed sources and keeps them revealed", () => {
    let state = createInitialGameState();
    const beforeEvidence = reduceGameState(state, { type: "REVEAL_CANDIDATE_FROGS" });
    expect(beforeEvidence).toBe(state);

    state.agents.xiaolang.memories[0] = {
      ...learnedMemory,
      id: "turtle-confirmed",
      sourceNpcId: "turtle",
      sourceNpcIds: ["turtle"],
      confidence: "confirmed",
    };
    state.agents.modian.memories[0] = {
      ...learnedMemory,
      id: "crab-confirmed",
      sourceNpcId: "crab",
      sourceNpcIds: ["crab"],
      confidence: "confirmed",
    };
    state = reduceGameState(state, { type: "REVEAL_CANDIDATE_FROGS" });
    expect(state.candidateFrogsRevealed).toBe(true);
    expect(state.objective).toContain("三位候选妈妈");

    state.agents.xiaolang.memories[0] = null;
    state.agents.modian.memories[0] = null;
    expect(reduceGameState(state, { type: "DECAY_MEMORIES", amount: 5 }).candidateFrogsRevealed).toBe(true);
  });

  it("does not allow choosing a hidden candidate frog", () => {
    const state = createInitialGameState();
    const next = reduceGameState(state, { type: "CHOOSE_MOTHER", frogId: "marsh-frog", correct: true });
    expect(next).toBe(state);
  });

  it("supports demo success and failure endings without investigation setup", () => {
    const success = reduceGameState(createInitialGameState(), {
      type: "DEMO_ENDING",
      frogId: "marsh-frog",
      correct: true,
    });
    expect(success.phase).toBe("ending");
    expect(success.candidateFrogsRevealed).toBe(true);
    expect(success.ending).toEqual({ selectedMotherId: "marsh-frog", correct: true });

    const failure = reduceGameState(createInitialGameState(), {
      type: "DEMO_ENDING",
      frogId: "tree-frog",
      correct: false,
    });
    expect(failure.ending).toEqual({ selectedMotherId: "tree-frog", correct: false });
  });

  it("adds travel fatigue, restores it at rest, and decays unreinforced memories", () => {
    let state = createInitialGameState();
    state.agents.modian.memories[0] = { ...learnedMemory, strength: 38, fidelity: "compressed" };
    state = reduceGameState(state, { type: "ADD_FATIGUE", agentIds: ["modian"], amount: 86, reason: "movement" });
    expect(state.agents.modian.fatigue).toBe(86);
    expect(state.agents.modian.mode).toBe("tired");

    state = reduceGameState(state, { type: "DECAY_MEMORIES", amount: 5 });
    expect(state.agents.modian.memories[0]).toMatchObject({ strength: 33, fidelity: "fragmented", confidence: "questioned" });
    state = reduceGameState(state, { type: "DECAY_MEMORIES", amount: 40 });
    expect(state.agents.modian.memories[0]).toBeNull();

    state = reduceGameState(state, { type: "REST_SQUAD" });
    expect(state.agents.modian.fatigue).toBe(51);
    expect(state.agents.modian.mode).toBe("following");
  });

  it("cancels model-dependent actions without creating memories when AI disconnects", () => {
    let state = createInitialGameState();
    state = reduceGameState(state, { type: "START_INVESTIGATION", agentId: "modian", task });
    state = reduceGameState(state, { type: "BEGIN_INTERACTION", agentId: "modian", taskId: task.id });
    state = reduceGameState(state, {
      type: "START_DISCUSSION",
      discussion: {
        id: "discussion-1",
        agentIds: ["xiaolang", "paopao"],
        topic: "location",
        autonomous: false,
      },
    });

    const next = reduceGameState(state, { type: "CANCEL_AI_ACTIONS" });

    expect(next.agents.modian.mode).toBe("returning");
    expect(next.agents.modian.activeTask).toBeUndefined();
    expect(next.agents.xiaolang.mode).toBe("following");
    expect(next.agents.paopao.mode).toBe("following");
    expect(next.discussion).toBeUndefined();
    expect(next.agents.modian.memories.every((memory) => memory === null)).toBe(true);
    expect(next.objective).toContain("没有生成记忆");
  });
});
