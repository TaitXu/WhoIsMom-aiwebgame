import { describe, expect, it, vi } from "vitest";
import { createAgentService, ModelUnavailableError, type AgentAdapter } from "../src/ai/agentService";
import type { AgentResponse, JudgeJumpLearningRequest } from "../src/ai/contracts";

const request: JudgeJumpLearningRequest = {
  requestId: "jump-check",
  task: "judge_jump_learning",
  agent: { id: "modian", personality: "cautious" },
  trainingSourceNpcId: "grasshopper",
  trainingSummary: "等荷叶回弹时朝下一片叶心跳",
  memories: [],
};

function response(source: AgentResponse["source"]): AgentResponse {
  return {
    requestId: request.requestId,
    source,
    result: {
      task: "judge_jump_learning",
      outcome: "partial",
      relevantMemoryIds: [],
      spokenSummary: "还需要再练一次。",
    },
  };
}

describe("agent service model gate", () => {
  it("uses a lightweight model check before starting the game", async () => {
    const remote: AgentAdapter = {
      check: vi.fn(async () => undefined),
      run: vi.fn(async () => response("model")),
    };
    const service = createAgentService(remote);

    await expect(service.checkAvailability()).resolves.toBeUndefined();
    expect(remote.check).toHaveBeenCalledOnce();
    expect(remote.run).not.toHaveBeenCalled();
    expect(service.getStatus()).toBe("ready");
  });

  it("blocks start when the lightweight model check fails", async () => {
    const remote: AgentAdapter = {
      check: vi.fn(async () => { throw new Error("模型响应超时"); }),
      run: vi.fn(async () => response("model")),
    };
    const service = createAgentService(remote);

    await expect(service.checkAvailability()).rejects.toMatchObject({
      name: "ModelUnavailableError",
      message: expect.stringContaining("模型响应超时"),
    });
    expect(service.getStatus()).toBe("unavailable");
  });

  it("marks the service ready only after a real model response", async () => {
    const remote: AgentAdapter = { run: vi.fn(async () => response("model")) };
    const service = createAgentService(remote);

    await expect(service.judgeJumpLearning(request)).resolves.toMatchObject({ source: "model" });
    expect(service.getStatus()).toBe("ready");
  });

  it("rejects fallback responses instead of creating local memories", async () => {
    const remote: AgentAdapter = { run: vi.fn(async () => response("fallback")) };
    const service = createAgentService(remote);
    const listener = vi.fn();
    service.subscribe(listener);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(service.judgeJumpLearning(request)).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(service.getStatus()).toBe("unavailable");
    expect(listener).toHaveBeenCalledWith("unavailable", expect.any(ModelUnavailableError));
  });

  it("reports network failures as unavailable", async () => {
    const remote: AgentAdapter = { run: vi.fn(async () => { throw new Error("offline"); }) };
    const service = createAgentService(remote);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(service.judgeJumpLearning(request)).rejects.toMatchObject({
      name: "ModelUnavailableError",
    });
    expect(service.getStatus()).toBe("unavailable");
  });
});
