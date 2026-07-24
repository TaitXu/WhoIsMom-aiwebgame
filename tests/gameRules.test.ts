import { describe, expect, it } from "vitest";
import type { EvidenceEvent, InvestigationTask, Memory } from "../src/core/types";
import { reduceGameState } from "../src/game/state/gameRules";
import { createInitialGameState } from "../src/game/state/gameState";

const task: InvestigationTask = {
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
  createdAt: 1,
};

describe("game rules", () => {
  it("completes an investigation once and spends one action", () => {
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
    });

    expect(state.actionsLeft).toBe(6);
    expect(state.agents.xiaolang.memories[0]?.id).toBe("memory-1");
    expect(state.evidenceLog).toHaveLength(1);
    expect(state.agents.xiaolang.mode).toBe("returning");

    const duplicate = reduceGameState(state, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      memory: learnedMemory,
      slot: 1,
      evidence,
    });
    expect(duplicate).toBe(state);
  });

  it("ignores a late AI result after recall", () => {
    let state = createInitialGameState();
    state = reduceGameState(state, { type: "START_INVESTIGATION", agentId: "xiaolang", task });
    state = reduceGameState(state, { type: "BEGIN_INTERACTION", agentId: "xiaolang", taskId: task.id });
    state = reduceGameState(state, { type: "RECALL_AGENT", agentId: "xiaolang" });
    const afterLateResult = reduceGameState(state, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      memory: learnedMemory,
      slot: 0,
      evidence,
    });

    expect(afterLateResult).toBe(state);
    expect(state.actionsLeft).toBe(7);
    expect(state.agents.xiaolang.memories[0]).toBeNull();
  });

  it("ignores a late AI result after the game has ended", () => {
    let state = createInitialGameState();
    state = reduceGameState(state, { type: "START_INVESTIGATION", agentId: "xiaolang", task });
    state = reduceGameState(state, { type: "BEGIN_INTERACTION", agentId: "xiaolang", taskId: task.id });
    state = reduceGameState(state, {
      type: "CHOOSE_MOTHER",
      frogId: "marsh-frog",
      correct: true,
    });
    const endingState = state;
    const afterLateResult = reduceGameState(state, {
      type: "COMPLETE_INVESTIGATION",
      agentId: "xiaolang",
      taskId: task.id,
      memory: learnedMemory,
      slot: 0,
      evidence,
    });

    expect(afterLateResult).toBe(endingState);
    expect(afterLateResult.actionsLeft).toBe(7);
    expect(afterLateResult.objective).toBe("你们找到了真正的妈妈");
    expect(afterLateResult.agents.xiaolang.memories[0]).toBeNull();
    expect(afterLateResult.evidenceLog).toHaveLength(0);
  });

  it("updates confidence during discussion and spends one action", () => {
    let state = createInitialGameState();
    state.agents.xiaolang.memories[0] = learnedMemory;
    state.agents.modian.memories[0] = {
      ...learnedMemory,
      id: "memory-local",
      topic: "location",
      sourceNpcId: "turtle",
      rememberedSource: "老乌龟",
    };
    state = reduceGameState(state, {
      type: "START_DISCUSSION",
      discussion: {
        id: "discussion-1",
        agentIds: ["xiaolang", "modian"],
        topic: "location",
      },
    });
    state = reduceGameState(state, {
      type: "COMPLETE_DISCUSSION",
      discussionId: "discussion-1",
      updates: [
        { agentId: "xiaolang", memoryId: "memory-1", confidence: "questioned", reinforced: false },
        { agentId: "modian", memoryId: "memory-local", confidence: "confirmed", reinforced: true },
      ],
      evidence: {
        ...evidence,
        id: "discussion-evidence",
        kind: "discussion",
        agentIds: ["xiaolang", "modian"],
        summary: "雨林不是本地",
      },
    });

    expect(state.actionsLeft).toBe(6);
    expect(state.agents.xiaolang.memories[0]?.confidence).toBe("questioned");
    expect(state.agents.modian.memories[0]?.confidence).toBe("confirmed");
    expect(state.discussion).toBeUndefined();
  });
});
