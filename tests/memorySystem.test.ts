import { describe, expect, it } from "vitest";
import type { Memory } from "../src/core/types";
import { chooseMemorySlot } from "../src/game/memory/memorySystem";

export function memory(id: string, createdAt: number, reinforced = false): Memory {
  return {
    id,
    factIds: [id],
    topic: "appearance",
    summary: id,
    rememberedSource: "test",
    sourceNpcId: "dragonfly",
    sourceNpcIds: ["dragonfly"],
    emotion: "calm",
    confidence: reinforced ? "confirmed" : "believed",
    fidelity: "detailed",
    transmission: "direct",
    strength: 100,
    createdAt,
    reinforced,
    resultSource: "fallback",
  };
}

describe("memory slots", () => {
  it("uses the first empty slot", () => {
    expect(
      chooseMemorySlot({
        personality: "cautious",
        memoryCapacity: 3,
        memories: [memory("a", 1), null, null],
      }),
    ).toBe(1);
  });

  it("protects reinforced memories for a cautious tadpole", () => {
    expect(
      chooseMemorySlot({
        personality: "cautious",
        memoryCapacity: 3,
        memories: [memory("old-protected", 1, true), memory("replace", 2), memory("new", 3)],
      }),
    ).toBe(1);
  });

  it("replaces unreinforced consensus gaps for a social tadpole", () => {
    expect(
      chooseMemorySlot({
        personality: "social",
        memoryCapacity: 3,
        memories: [memory("shared", 1, true), memory("solo", 2), memory("shared-new", 3, true)],
      }),
    ).toBe(1);
  });
});
