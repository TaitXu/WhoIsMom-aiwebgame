import { describe, expect, it } from "vitest";
import { normalizeModelResult, resolveChatCompletionsEndpoint } from "../api/agent";
import { validateAgentResult, type EncodeMemoryRequest } from "../src/ai/contracts";

describe("agent API endpoint normalization", () => {
  it("appends chat completions to an OpenAI-compatible base URL", () => {
    expect(resolveChatCompletionsEndpoint("https://api.siliconflow.cn/v1"))
      .toBe("https://api.siliconflow.cn/v1/chat/completions");
  });

  it("accepts a complete chat completions URL without duplicating its path", () => {
    expect(resolveChatCompletionsEndpoint("https://api.siliconflow.cn/v1/chat/completions/"))
      .toBe("https://api.siliconflow.cn/v1/chat/completions");
  });

  it("normalizes harmless GLM metadata variants without weakening fact validation", () => {
    const request: EncodeMemoryRequest = {
      requestId: "encode-1",
      task: "encode_memory",
      agent: { id: "modian", personality: "cautious", communicationStyle: "literal", fatigue: 0 },
      npc: { id: "turtle", name: "老乌龟" },
      topic: "appearance",
      allowedFacts: [{
        id: "turtle-appearance",
        topic: "appearance",
        value: "腹部闪过一抹暖黄色",
        veracity: "true",
      }],
      memories: [null, null, null],
    };
    const normalized = normalizeModelResult(request, {
      task: "encode_memory",
      selectedFactIds: ["turtle-appearance"],
      omittedFields: ["place"],
      suggestedSlot: "appearance",
      tone: "cautious",
      fidelity: "high",
      spokenSummary: "腹部好像闪过一抹暖黄色",
    });

    expect(validateAgentResult(request, normalized)).toMatchObject({
      suggestedSlot: 0,
      tone: "calm",
      fidelity: "detailed",
    });
  });
});
