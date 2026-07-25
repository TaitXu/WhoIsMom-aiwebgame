import { describe, expect, it } from "vitest";
import { demoCase } from "../src/game/case/demoCase";
import { evaluateConversationRisk } from "../src/game/simulation/conversationRisk";

describe("conversation risk", () => {
  it("keeps calm conversations safe and makes a frightening mismatch risky", () => {
    const turtle = demoCase.npcs.find((npc) => npc.id === "turtle")!;
    const crab = demoCase.npcs.find((npc) => npc.id === "crab")!;
    expect(evaluateConversationRisk({ personality: "cautious", fatigue: 0 }, turtle, "safe", 73129)).toBe("memory");
    expect(["memory", "nothing", "panic"]).toContain(
      evaluateConversationRisk({ personality: "cautious", fatigue: 0 }, crab, "risky", 73129),
    );
    expect(evaluateConversationRisk({ personality: "cautious", fatigue: 0 }, crab, "risky", 73129)).not.toBe("memory");
  });

  it("raises the risk further when the tadpole is already exhausted", () => {
    const grasshopper = demoCase.npcs.find((npc) => npc.id === "grasshopper")!;
    const taskId = Array.from({ length: 100 }, (_, index) => `fatigue-${index}`).find((id) =>
      evaluateConversationRisk({ personality: "cautious", fatigue: 0 }, grasshopper, id, 73129) === "memory" &&
      evaluateConversationRisk({ personality: "cautious", fatigue: 75 }, grasshopper, id, 73129) !== "memory",
    );
    expect(taskId).toBeDefined();
  });
});
