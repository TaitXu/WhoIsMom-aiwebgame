import type { Fact, FrogId, NpcId, Topic } from "../../core/types";

export type NpcDefinition = Readonly<{
  id: NpcId;
  name: string;
  role: string;
  facts: readonly Fact[];
  topics: readonly Topic[];
  position: readonly [number, number, number];
}>;

export type FrogAccessory = "leaf-hat" | "red-scarf";

export type CandidateFrog = Readonly<{
  id: FrogId;
  name: string;
  description: string;
  bodyColor: number;
  bellyColor: number;
  accentColor: number;
  accessory: FrogAccessory;
  position: readonly [number, number, number];
}>;

export type CaseDefinition = Readonly<{
  motherId: FrogId;
  npcs: readonly NpcDefinition[];
  candidates: readonly CandidateFrog[];
}>;
