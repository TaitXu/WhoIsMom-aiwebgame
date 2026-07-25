import { describe, expect, it, vi } from "vitest";
import type { AgentResponse, ReconcileMemoriesRequest } from "../src/ai/contracts";
import type { AgentService } from "../src/ai/agentService";
import type { Memory } from "../src/core/types";
import { createGameDirector } from "../src/game/simulation/gameDirector";
import { createGameStore } from "../src/game/state/gameStore";
import { createInitialGameState } from "../src/game/state/gameState";

function memory(id: string, topic: Memory["topic"], sourceNpcId: Memory["sourceNpcId"]): Memory {
  return {
    id,
    factIds: [id],
    topic,
    summary: id,
    rememberedSource: sourceNpcId,
    sourceNpcId,
    sourceNpcIds: [sourceNpcId],
    emotion: "calm",
    confidence: "believed",
    fidelity: "detailed",
    transmission: "direct",
    strength: 100,
    createdAt: 1,
    reinforced: false,
    resultSource: "fallback",
  };
}

describe("game director discussions", () => {
  it("requires a shared topic and sends only that topic to reconciliation", () => {
    const state = createInitialGameState();
    state.agents.modian.memories[0] = memory("modian-location", "location", "turtle");
    state.agents.modian.memories[1] = memory("modian-jump", "jump", "grasshopper");
    state.agents.paopao.memories[0] = memory("paopao-location", "location", "crab");

    let captured: ReconcileMemoriesRequest | undefined;
    const pending = new Promise<AgentResponse>(() => {});
    const service: AgentService = {
      encodeMemory: vi.fn(),
      judgeJumpLearning: vi.fn(),
      reconcileMemories: vi.fn((request) => {
        captured = request;
        return pending;
      }),
    };
    const director = createGameDirector({ store: createGameStore(state), service });

    expect(director.startDiscussion("modian", "paopao", "jump")).toBe(false);
    expect(service.reconcileMemories).not.toHaveBeenCalled();

    expect(director.startDiscussion("modian", "paopao", "location")).toBe(true);
    expect(captured?.memories.map((item) => item.id)).toEqual(["modian-location", "paopao-location"]);
  });

  it("can mix conflicting memories from different animals into a traceable new memory", async () => {
    vi.useFakeTimers();
    try {
      const state = createInitialGameState();
      state.agents.modian.memories[0] = memory("travel-location", "location", "dragonfly");
      state.agents.paopao.memories[0] = memory("local-location", "location", "turtle");
      const store = createGameStore(state);
      const service: AgentService = {
        encodeMemory: vi.fn(),
        judgeJumpLearning: vi.fn(),
        reconcileMemories: vi.fn(async (request) => ({
          requestId: request.requestId,
          source: "fallback",
          result: {
            task: "reconcile_memories",
            outcome: "question",
            acceptedMemoryIds: ["local-location"],
            questionedMemoryIds: ["travel-location"],
            spokenSummary: "一段说远方，一段说本地，我可能把两个地点拼在一起了。",
          },
        })),
        decideMovementIntent: vi.fn(),
        generateCast: vi.fn(),
      };
      const director = createGameDirector({ store, service });
      expect(director.startDiscussion("modian", "paopao", "location")).toBe(true);
      await vi.advanceTimersByTimeAsync(700);
      expect(store.getState().agents.paopao.memories.some((item) =>
        item?.transmission === "mixed" &&
        item.sourceNpcIds.includes("dragonfly") &&
        item.sourceNpcIds.includes("turtle") &&
        item.parentMemoryIds?.length === 2,
      )).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("game director conversations", () => {
  it("automatically reveals the candidate frogs once two sources are confirmed", () => {
    const state = createInitialGameState();
    state.agents.modian.memories[0] = {
      ...memory("turtle-confirmed", "appearance", "turtle"),
      confidence: "confirmed",
    };
    state.agents.paopao.memories[0] = {
      ...memory("crab-confirmed", "appearance", "crab"),
      confidence: "confirmed",
    };
    const store = createGameStore(state);
    const service: AgentService = {
      encodeMemory: vi.fn(),
      judgeJumpLearning: vi.fn(),
      reconcileMemories: vi.fn(),
      decideMovementIntent: vi.fn(),
      generateCast: vi.fn(),
    };
    createGameDirector({ store, service }).update(0.1);
    expect(store.getState().candidateFrogsRevealed).toBe(true);
  });

  it("requires the explicitly selected learned tadpole for a gate scout", () => {
    const state = createInitialGameState();
    state.agents.modian.jumpKnowledge = "learned";
    state.agents.xiaolang.jumpKnowledge = "learned";
    const store = createGameStore(state);
    const service: AgentService = {
      encodeMemory: vi.fn(),
      judgeJumpLearning: vi.fn(),
      reconcileMemories: vi.fn(),
      decideMovementIntent: vi.fn(),
      generateCast: vi.fn(),
    };
    const director = createGameDirector({ store, service });
    expect(director.scoutGate("dragonfly-gap")).toBe(false);
    expect(director.scoutGate("dragonfly-gap", "paopao")).toBe(false);
    expect(director.scoutGate("dragonfly-gap", "xiaolang")).toBe(true);
    expect(store.getState().agents.xiaolang.mode).toBe("jumping");
    const task = store.getState().agents.xiaolang.activeTask!;
    director.finishGateJump("xiaolang", task.id);
    expect(store.getState().agents.xiaolang.mode).toBe("considering");
    director.update(1.7);
    expect(store.getState().agents.xiaolang.mode).toBe("approaching");
    expect(store.getState().agents.modian.mode).toBe("following");
  });

  it("starts without player proximity, then exposes dialogue progress after arrival", () => {
    const state = createInitialGameState();
    expect(state.nearbyNpcId).toBeUndefined();
    state.agents.modian.memories[0] = memory("dragonfly-appearance", "appearance", "dragonfly");
    const store = createGameStore(state);
    const pending = new Promise<AgentResponse>(() => {});
    const service: AgentService = {
      encodeMemory: vi.fn(() => pending),
      judgeJumpLearning: vi.fn(),
      reconcileMemories: vi.fn(),
    };
    const director = createGameDirector({ store, service });

    expect(director.startConversation(["modian"], "dragonfly")).toBe(true);
    const task = store.getState().agents.modian.activeTask;
    expect(task?.type).toBe("investigation");
    expect(task?.type === "investigation" ? task.topic : undefined).toBe("location");
    expect(director.getTaskProgress("modian")).toMatchObject({ kind: "dialogue", label: "去聊天", value: 0.06 });

    director.arriveAtNpc("modian", task!.id);
    director.update(0.5);
    expect(director.getTaskProgress("modian")?.value).toBeGreaterThan(0.4);
    expect(director.getTaskProgress("modian")?.label).toBe("聊天中");
  });

  it("changes an NPC's available testimony when the investigator carries a relevant memory", async () => {
    const state = createInitialGameState();
    state.agents.modian.memories[0] = {
      ...memory("travel", "appearance", "dragonfly"),
      factIds: ["dragonfly-appearance"],
    };
    const store = createGameStore(state);
    let allowedFactIds: string[] = [];
    const service: AgentService = {
      encodeMemory: vi.fn(async (request) => {
        allowedFactIds = request.allowedFacts.map((fact) => fact.id);
        return {
          requestId: request.requestId,
          source: "fallback",
          result: {
            task: "encode_memory",
            selectedFactIds: [request.allowedFacts[0]!.id],
            omittedFields: [],
            suggestedSlot: 0,
            tone: "calm",
            fidelity: "detailed",
            spokenSummary: request.allowedFacts[0]!.value,
          },
        };
      }),
      judgeJumpLearning: vi.fn(),
      reconcileMemories: vi.fn(),
      decideMovementIntent: vi.fn(),
      generateCast: vi.fn(),
    };
    const director = createGameDirector({ store, service });
    expect(director.startInvestigation(["modian"], "turtle", "appearance")).toBe(true);
    const task = store.getState().agents.modian.activeTask!;
    director.arriveAtNpc("modian", task.id);
    director.update(1.2);
    await Promise.resolve();
    expect(allowedFactIds).toEqual(["turtle-appearance-after-travel"]);
  });

  it("stores only one atomic clue even when an adapter returns several facts and a leaking summary", async () => {
    const state = createInitialGameState();
    const store = createGameStore(state);
    const service: AgentService = {
      encodeMemory: vi.fn(async (request) => ({
        requestId: request.requestId,
        source: "model",
        result: {
          task: "encode_memory",
          selectedFactIds: request.allowedFacts.map((fact) => fact.id),
          omittedFields: [],
          suggestedSlot: 0,
          tone: "calm",
          fidelity: "detailed",
          spokenSummary: request.allowedFacts.map((fact) => fact.value).join("，"),
        },
      })),
      judgeJumpLearning: vi.fn(),
      reconcileMemories: vi.fn(),
      decideMovementIntent: vi.fn(),
      generateCast: vi.fn(),
    };
    const director = createGameDirector({ store, service });
    expect(director.startInvestigation(["modian"], "turtle", "appearance")).toBe(true);
    const task = store.getState().agents.modian.activeTask!;
    director.arriveAtNpc("modian", task.id);
    director.update(1.2);
    await Promise.resolve();

    const stored = store.getState().agents.modian.memories.find((item) => item?.sourceNpcId === "turtle");
    expect(stored?.factIds).toEqual(["turtle-appearance"]);
    expect(stored?.summary).toContain("腹部闪过一抹暖黄色");
    expect(stored?.summary).not.toContain("头顶");
    expect(stored?.summary).not.toBe("腹部闪过一抹暖黄色，头顶像压着一片圆叶");
  });

  it("makes idle tadpoles speak and autonomously talk to a companion", () => {
    const store = createGameStore(createInitialGameState());
    const pending = new Promise<AgentResponse>(() => {});
    const service: AgentService = {
      encodeMemory: vi.fn(() => pending),
      judgeJumpLearning: vi.fn(() => pending),
      reconcileMemories: vi.fn(() => pending),
      decideMovementIntent: vi.fn(() => pending),
      generateCast: vi.fn(() => pending),
    };
    const director = createGameDirector({ store, service });
    director.update(9);
    expect(Object.values(store.getState().agents).some((agent) => agent.utterance?.kind === "idle")).toBe(true);
    director.update(10);
    expect(Object.values(store.getState().agents).filter((agent) => agent.utterance?.kind === "peer")).toHaveLength(2);
    expect(Object.values(store.getState().agents).filter((agent) => agent.fatigue === 1)).toHaveLength(2);
  });
});
