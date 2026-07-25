import { describe, expect, it } from "vitest";
import { demoCase } from "../src/game/case/demoCase";
import { containsForbiddenSpeciesTerm } from "../src/ai/contracts";

describe("demo case", () => {
  it("defines a connected nine-region world with distributed entities", () => {
    expect(demoCase.regions).toHaveLength(9);
    expect(new Set(demoCase.regions.map((region) => region.grid.join(","))).size).toBe(9);
    expect(demoCase.npcs).toHaveLength(4);
    expect(new Set(demoCase.candidates.map((frog) => frog.regionId)).size).toBe(3);
  });

  it("offers six one-time cleanup tasks worth eight inspiration", () => {
    expect(demoCase.obstacles).toHaveLength(6);
    expect(demoCase.obstacles.reduce((total, obstacle) => total + obstacle.reward, 0)).toBe(8);
    expect(demoCase.gates.map((gate) => gate.requirement)).toEqual(["one", "all"]);
  });

  it("has one deterministic mother among three candidates", () => {
    expect(demoCase.candidates).toHaveLength(3);
    expect(demoCase.candidates.some((candidate) => candidate.id === demoCase.motherId)).toBe(true);
  });

  it("keeps species names out of every player-facing clue and includes fair reliability cues", () => {
    const visibleCaseText = [
      ...demoCase.candidates.flatMap((candidate) => [candidate.name, candidate.description]),
      ...demoCase.npcs.flatMap((npc) => [npc.name, npc.role, npc.credibilityCue, ...npc.facts.map((fact) => fact.value)]),
    ];
    expect(visibleCaseText.some(containsForbiddenSpeciesTerm)).toBe(false);
    expect(demoCase.npcs.every((npc) => npc.credibilityCue.length > 0)).toBe(true);
    expect(demoCase.npcs.flatMap((npc) => npc.facts).some((fact) => fact.veracity === "false")).toBe(true);
    expect(demoCase.npcs.flatMap((npc) => npc.facts).some((fact) => fact.requiresAnyFactIds?.length)).toBe(true);
  });

  it("keeps identification memories atomic instead of bundling several visual answers", () => {
    const appearanceFacts = demoCase.npcs.flatMap((npc) => npc.facts).filter((fact) => fact.topic === "appearance");
    expect(appearanceFacts.every((fact) => !/[，；;]/.test(fact.value))).toBe(true);
  });
});
