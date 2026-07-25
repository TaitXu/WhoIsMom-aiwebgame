import { describe, expect, it } from "vitest";
import { demoCase } from "../src/game/case/demoCase";

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
});
