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
  emotion: "excited",
  confidence: "believed",
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
});
