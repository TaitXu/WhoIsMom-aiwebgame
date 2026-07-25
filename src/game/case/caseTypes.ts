import type {
  Fact,
  FrogId,
  GateId,
  NpcId,
  ObstacleId,
  Personality,
  RegionId,
  Topic,
} from "../../core/types";

export type NpcDefinition = Readonly<{
  id: NpcId;
  name: string;
  role: string;
  facts: readonly Fact[];
  topics: readonly Topic[];
  regionId: RegionId;
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
  regionId: RegionId;
  position: readonly [number, number, number];
}>;

export type RegionDefinition = Readonly<{
  id: RegionId;
  name: string;
  grid: readonly [number, number];
  center: readonly [number, number, number];
  accentColor: number;
  landmark: "willow" | "dragonfly-post" | "spring-flower" | "stone-arch" | "nest" | "reed-tower" | "mud-bloom" | "lotus-arch" | "crescent-reeds";
}>;

export type ObstacleDefinition = Readonly<{
  id: ObstacleId;
  name: string;
  description: string;
  regionId: RegionId;
  position: readonly [number, number, number];
  reward: 1 | 2;
  preferredPersonality: Personality;
}>;

export type GateDefinition = Readonly<{
  id: GateId;
  name: string;
  description: string;
  regionId: RegionId;
  position: readonly [number, number, number];
  requirement: "one" | "all";
}>;

export type CaseDefinition = Readonly<{
  motherId: FrogId;
  regions: readonly RegionDefinition[];
  npcs: readonly NpcDefinition[];
  candidates: readonly CandidateFrog[];
  obstacles: readonly ObstacleDefinition[];
  gates: readonly GateDefinition[];
}>;
