import { describe, expect, it } from "vitest";
import type { GenerateCastRequest } from "../src/ai/contracts";
import { validateAgentResult } from "../src/ai/contracts";
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
    sourceNpcIds: ["dragonfly"],
    emotion: "calm",
    confidence: "believed",
    fidelity: "detailed",
    transmission: "direct",
    strength: 100,
    createdAt,
    reinforced: false,
    resultSource: "fallback",
  };
}

describe("local agent fallback", () => {
  it("returns a validated cast with private personality profiles", async () => {
    const request: GenerateCastRequest = {
      requestId: "cast",
      task: "generate_cast",
      seed: 17,
      agentIds: ["modian", "xiaolang", "paopao"],
      frogIds: ["tree-frog", "bullfrog", "marsh-frog"],
      motherId: "marsh-frog",
    };
    const response = await createLocalAgentFallback().run(request);
    expect(validateAgentResult(request, response.result)).not.toBeNull();
    if (response.result.task === "generate_cast") {
      expect(response.result.agents.every((agent) => agent.hiddenProfile.dossier.length > 0)).toBe(true);
    }
  });

  it("lets an impulsive tadpole omit place context", async () => {
    const response = await createLocalAgentFallback().run({
      requestId: "encode",
      task: "encode_memory",
      agent: { id: "xiaolang", personality: "impulsive", communicationStyle: "embellishing", fatigue: 20 },
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

  it("extracts exactly one misleading fact and omits context even at low fatigue", async () => {
    const response = await createLocalAgentFallback().run({
      requestId: "limited-encode",
      task: "encode_memory",
      agent: { id: "modian", personality: "cautious", communicationStyle: "literal", fatigue: 0 },
      npc: { id: "crab", name: "河蟹" },
      topic: "appearance",
      allowedFacts: [
        { id: "true-clue", topic: "appearance", value: "腹部偏黄", source: "亲眼所见", veracity: "true" },
        { id: "false-clue", topic: "appearance", value: "影子拖着红尾巴", source: "水鸟转述", veracity: "false" },
      ],
      memories: [null, null, null],
    });

    expect(response.result.task).toBe("encode_memory");
    if (response.result.task === "encode_memory") {
      expect(response.result.selectedFactIds).toEqual(["false-clue"]);
      expect(response.result.omittedFields.length).toBeGreaterThan(0);
      expect(response.result.omittedFields).toContain("source");
      expect(response.result.spokenSummary).not.toContain("水鸟转述");
    }
  });

  it("questions travel memories when local evidence exists", async () => {
    const travel = memory("travel", 1);
    const local = { ...memory("local", 2), sourceNpcId: "turtle" as const, sourceNpcIds: ["turtle" as const] };
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
