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
    emotion: "calm",
    confidence: "believed",
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
});
