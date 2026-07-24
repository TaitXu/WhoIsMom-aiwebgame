import { describe, expect, it } from "vitest";
import { createLocalAgentFallback } from "../src/ai/localAgentFallback";
import type { Memory } from "../src/core/types";

function memory(id: string, createdAt: number): Memory {
  return {
    id,
    factIds: [id],
    topic: "appearance",
    summary: id,
    rememberedSource: "旅行蜻蜓",
    sourceNpcId: "dragonfly",
    emotion: "calm",
    confidence: "believed",
    createdAt,
    reinforced: false,
    resultSource: "fallback",
  };
}

describe("local agent fallback", () => {
  it("lets an impulsive tadpole omit place context", async () => {
    const response = await createLocalAgentFallback().run({
      requestId: "encode",
      task: "encode_memory",
      agent: { id: "xiaolang", personality: "impulsive" },
      npc: { id: "dragonfly", name: "旅行蜻蜓" },
      topic: "appearance",
      allowedFacts: [
        {
          id: "dragonfly-appearance",
          topic: "appearance",
          value: "红脚蓝绿色背部",
          place: "远方雨林",
          time: "上周",
        },
      ],
      memories: [null, null, null],
    });

    expect(response.result.task).toBe("encode_memory");
    if (response.result.task === "encode_memory") {
      expect(response.result.omittedFields).toContain("place");
      expect(response.result.spokenSummary).not.toContain("雨林");
    }
  });

  it("questions travel memories when local evidence exists", async () => {
    const travel = memory("travel", 1);
    const local = { ...memory("local", 2), sourceNpcId: "turtle" as const };
    const response = await createLocalAgentFallback().run({
      requestId: "discuss",
      task: "reconcile_memories",
      agentIds: ["xiaolang", "modian"],
      personalities: ["impulsive", "cautious"],
      topic: "location",
      memories: [travel, local],
    });

    expect(response.result.task).toBe("reconcile_memories");
    if (response.result.task === "reconcile_memories") {
      expect(response.result.questionedMemoryIds).toEqual(["travel"]);
      expect(response.result.acceptedMemoryIds).toEqual(["local"]);
    }
  });

  it("questions a contextless travel memory when another tadpole remembered the rainforest", async () => {
    const vague = memory("vague", 1);
    const contextual = {
      ...memory("contextual", 2),
      topic: "location" as const,
      summary: "那是在远方雨林，不是本地河道。",
    };
    const response = await createLocalAgentFallback().run({
      requestId: "context-discussion",
      task: "reconcile_memories",
      agentIds: ["xiaolang", "modian"],
      personalities: ["impulsive", "cautious"],
      topic: "location",
      memories: [vague, contextual],
    });

    expect(response.result.task).toBe("reconcile_memories");
    if (response.result.task === "reconcile_memories") {
      expect(response.result.outcome).toBe("revise");
      expect(response.result.questionedMemoryIds).toEqual(["vague"]);
      expect(response.result.acceptedMemoryIds).toEqual(["contextual"]);
    }
  });
});
