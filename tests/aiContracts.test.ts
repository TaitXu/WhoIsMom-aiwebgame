import { describe, expect, it } from "vitest";
import type { EncodeMemoryRequest } from "../src/ai/contracts";
import { validateAgentRequest, validateAgentResult } from "../src/ai/contracts";

const request: EncodeMemoryRequest = {
  requestId: "test",
  task: "encode_memory",
  agent: { id: "xiaolang", personality: "impulsive" },
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
        spokenSummary: "我看到一只红脚蓝背的青蛙！",
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
        spokenSummary: "它戴着一顶不存在的帽子。",
      }),
    ).toBeNull();
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
});
