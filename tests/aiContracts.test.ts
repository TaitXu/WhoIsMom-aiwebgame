import { describe, expect, it } from "vitest";
import type { EncodeMemoryRequest, GenerateCastRequest, GenerateCastResult } from "../src/ai/contracts";
import { validateAgentRequest, validateAgentResult } from "../src/ai/contracts";
import {
  fallbackFrogFeatures,
  frogFeatureConstraints,
  frogFeatureVocabulary,
} from "../src/game/case/frogFeatures";

const request: EncodeMemoryRequest = {
  requestId: "test",
  task: "encode_memory",
  agent: { id: "xiaolang", personality: "impulsive", communicationStyle: "embellishing", fatigue: 20 },
  npc: { id: "dragonfly", name: "旅行蜻蜓" },
  topic: "appearance",
  allowedFacts: [
    {
      id: "known-fact",
      topic: "appearance",
      value: "红脚蓝背",
      place: "雨林",
    },
  ],
  memories: [null, null, null],
};

const castRequest: GenerateCastRequest = {
  requestId: "cast",
  task: "generate_cast",
  seed: 7,
  agentIds: ["modian", "xiaolang", "paopao"],
  frogIds: ["tree-frog", "bullfrog", "marsh-frog"],
  motherId: "marsh-frog",
  featureVocabulary: frogFeatureVocabulary,
  requiredFeatures: frogFeatureConstraints,
};

function validCast(): GenerateCastResult {
  return {
    task: "generate_cast",
    agents: [
      { id: "modian", name: "墨点", personality: "cautious", introduction: "先观察再行动。" },
      { id: "xiaolang", name: "小浪", personality: "impulsive", introduction: "想到就立刻去做。" },
      { id: "paopao", name: "泡泡", personality: "social", introduction: "喜欢和同伴交流。" },
    ],
    frogs: [
      { id: "tree-frog", name: "溪声阿姨", features: { ...fallbackFrogFeatures["tree-frog"] } },
      { id: "bullfrog", name: "微雨阿姨", features: { ...fallbackFrogFeatures["bullfrog"] } },
      { id: "marsh-frog", name: "晚风阿姨", features: { ...fallbackFrogFeatures["marsh-frog"] } },
    ],
  };
}

describe("AI contracts", () => {
  it("accepts a constrained request and result", () => {
    expect(validateAgentRequest(request)).not.toBeNull();
    expect(
      validateAgentResult(request, {
        task: "encode_memory",
        selectedFactIds: ["known-fact"],
        omittedFields: ["place"],
        suggestedSlot: 0,
        tone: "excited",
        fidelity: "compressed",
        spokenSummary: "我敢肯定，它有红脚和蓝绿色背部！",
      }),
    ).not.toBeNull();
  });

  it("rejects invented fact ids", () => {
    expect(
      validateAgentResult(request, {
        task: "encode_memory",
        selectedFactIds: ["invented-fact"],
        omittedFields: [],
        suggestedSlot: 0,
        tone: "excited",
        fidelity: "compressed",
        spokenSummary: "它戴着一顶不存在的帽子。",
      }),
    ).toBeNull();
  });

  it("rejects more than one selected fact", () => {
    const multiFactRequest: EncodeMemoryRequest = {
      ...request,
      allowedFacts: [
        ...request.allowedFacts,
        { id: "second-fact", topic: "appearance", value: "头顶像压着一片叶子", veracity: "true" },
      ],
    };
    expect(validateAgentResult(multiFactRequest, {
      task: "encode_memory",
      selectedFactIds: ["known-fact", "second-fact"],
      omittedFields: ["source"],
      suggestedSlot: 0,
      tone: "calm",
      fidelity: "detailed",
      spokenSummary: "我一次记住了两条线索。",
    })).toBeNull();
  });

  it("requires a contextual or false fact when one is available", () => {
    const mixedRequest: EncodeMemoryRequest = {
      ...request,
      allowedFacts: [
        { id: "clear-fact", topic: "appearance", value: "腹部偏黄", veracity: "true" },
        { id: "misleading-fact", topic: "appearance", value: "影子像拖着红尾巴", veracity: "false" },
      ],
    };
    const baseResult = {
      task: "encode_memory" as const,
      omittedFields: ["source"] as Array<"time" | "place" | "source">,
      suggestedSlot: 0 as const,
      tone: "calm" as const,
      fidelity: "detailed" as const,
      spokenSummary: "我只记得一个模糊片段。",
    };
    expect(validateAgentResult(mixedRequest, {
      ...baseResult,
      selectedFactIds: ["clear-fact"],
    })).toBeNull();
    expect(validateAgentResult(mixedRequest, {
      ...baseResult,
      selectedFactIds: ["misleading-fact"],
    })).not.toBeNull();
  });

  it("requires every extracted memory to omit some context", () => {
    expect(validateAgentResult(request, {
      task: "encode_memory",
      selectedFactIds: ["known-fact"],
      omittedFields: [],
      suggestedSlot: 0,
      tone: "calm",
      fidelity: "detailed",
      spokenSummary: "我把所有上下文都记住了。",
    })).toBeNull();
  });

  it("rejects malformed requests before they reach the model", () => {
    expect(
      validateAgentRequest({
        requestId: "bad",
        task: "encode_memory",
        agent: { id: "xiaolang", personality: "impulsive" },
        topic: "appearance",
        allowedFacts: [{ id: "x", topic: "location", value: "错议题" }],
        memories: [],
      }),
    ).toBeNull();
  });

  it("accepts a constrained jump-learning judgment", () => {
    const jumpMemory = {
      id: "jump-memory",
      factIds: ["grasshopper-jump"],
      topic: "jump" as const,
      summary: "等荷叶回弹时跳向叶心。",
      rememberedSource: "弹簧蚱蜢",
      sourceNpcId: "grasshopper" as const,
      sourceNpcIds: ["grasshopper" as const],
      emotion: "calm" as const,
      confidence: "believed" as const,
      fidelity: "detailed" as const,
      transmission: "direct" as const,
      strength: 100,
      createdAt: 1,
      reinforced: false,
      resultSource: "fallback" as const,
    };
    const jumpRequest = {
      requestId: "jump",
      task: "judge_jump_learning" as const,
      agent: { id: "paopao" as const, personality: "social" as const },
      memories: [jumpMemory],
    };
    expect(validateAgentRequest(jumpRequest)).not.toBeNull();
    expect(validateAgentResult(jumpRequest, {
      task: "judge_jump_learning",
      outcome: "learned",
      relevantMemoryIds: ["jump-memory"],
      spokenSummary: "我懂得怎么跳了。",
    })).not.toBeNull();
  });

  it("rejects species leaks from model-visible text", () => {
    expect(validateAgentResult(request, {
      task: "encode_memory",
      selectedFactIds: ["known-fact"],
      omittedFields: ["place"],
      suggestedSlot: 0,
      tone: "excited",
      fidelity: "compressed",
      spokenSummary: "它一定是某种泽蛙。",
    })).toBeNull();
  });

  it("forces exhausted tadpoles to return fragmented memories without context", () => {
    const exhaustedRequest: EncodeMemoryRequest = {
      ...request,
      agent: { ...request.agent, fatigue: 82 },
    };
    expect(validateAgentResult(exhaustedRequest, {
      task: "encode_memory",
      selectedFactIds: ["known-fact"],
      omittedFields: ["time", "place", "source"],
      suggestedSlot: 0,
      tone: "afraid",
      fidelity: "fragmented",
      spokenSummary: "我太累了，只记得红色和一点蓝光……",
    })).not.toBeNull();
    expect(validateAgentResult(exhaustedRequest, {
      task: "encode_memory",
      selectedFactIds: ["known-fact"],
      omittedFields: ["place"],
      suggestedSlot: 0,
      tone: "calm",
      fidelity: "detailed",
      spokenSummary: "我把所有细节都记住了。",
    })).toBeNull();
  });

  it("requires one generated agent for each supported personality", () => {
    const cast = validCast();
    expect(validateAgentRequest(castRequest)).not.toBeNull();
    expect(validateAgentResult(castRequest, cast)).not.toBeNull();
    cast.agents[1]!.personality = "cautious";
    expect(validateAgentResult(castRequest, cast)).toBeNull();
  });

  it("rejects frog names that reveal a distinguishing feature", () => {
    const cast = validCast();
    cast.frogs[2]!.name = "红花阿姨";
    expect(validateAgentResult(castRequest, cast)).toBeNull();
  });

  it("requires each frog to use a different kind of red decoration", () => {
    const cast = validCast();
    cast.frogs[0]!.features = { ...cast.frogs[0]!.features, redAdornment: "scarf" };
    expect(validateAgentResult(castRequest, cast)).toBeNull();
  });

  it("rejects a decoy that shares fewer than three features with the mother", () => {
    const cast = validCast();
    cast.frogs[0]!.features = {
      ...cast.frogs[0]!.features,
      bellyTone: "cream",
      headAdornment: "reed-crown",
      hindLegShape: "sturdy",
    };
    expect(validateAgentResult(castRequest, cast)).toBeNull();
  });
});
