import { describe, expect, it } from "vitest";
import { countSharedFrogFeatures, frogFeatureKeys } from "../src/game/case/frogFeatures";
import { createSessionCase, sessionPersonalityOrder } from "../src/game/case/sessionGenerator";

describe("session case generation", () => {
  it("keeps the mother unique while every decoy remains plausibly similar", () => {
    const session = createSessionCase(20260726);
    const mother = session.candidates.find((candidate) => candidate.id === session.motherId)!;
    const decoys = session.candidates.filter((candidate) => candidate.id !== session.motherId);

    expect(new Set(session.candidates.map((candidate) => candidate.features.redAdornment)).size).toBe(3);
    decoys.forEach((decoy) => {
      expect(countSharedFrogFeatures(mother.features, decoy.features)).toBeGreaterThanOrEqual(3);
    });
    expect(frogFeatureKeys.filter((key) => (
      new Set(session.candidates.map((candidate) => candidate.features[key])).size > 1
    )).length).toBeGreaterThanOrEqual(5);
  });

  it("regenerates the mother case and textual evidence from the session seed", () => {
    const first = createSessionCase(11);
    const second = createSessionCase(12);

    expect(second.fingerprint).not.toBe(first.fingerprint);
    expect(second.npcs.flatMap((npc) => npc.facts.map((fact) => fact.value)))
      .not.toEqual(first.npcs.flatMap((npc) => npc.facts.map((fact) => fact.value)));
  });

  it("assigns every personality exactly once from the session seed", () => {
    expect(new Set(sessionPersonalityOrder(20260726)))
      .toEqual(new Set(["cautious", "impulsive", "social"]));
  });
});
