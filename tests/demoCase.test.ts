import { describe, expect, it } from "vitest";
import { demoCase } from "../src/game/case/demoCase";

describe("demo case", () => {
  it("offers three witnesses and all three investigation topics", () => {
    expect(demoCase.npcs).toHaveLength(3);
    demoCase.npcs.forEach((npc) => {
      expect(npc.topics).toEqual(["appearance", "location", "source"]);
      expect(new Set(npc.facts.map((fact) => fact.topic))).toEqual(
        new Set(["appearance", "location", "source"]),
      );
    });
  });

  it("has one deterministic mother among three candidates", () => {
    expect(demoCase.candidates).toHaveLength(3);
    expect(demoCase.candidates.some((candidate) => candidate.id === demoCase.motherId)).toBe(true);
  });
});
