import type {
  Fact,
  FrogFeatures,
  FrogId,
  GateId,
  NpcId,
  NpcIntimidation,
  NpcReliability,
  ObstacleId,
  Personality,
  RegionId,
  Topic,
} from "../../core/types";

export type NpcDefinition = Readonly<{
  id: NpcId;
  name: string;
  role: string;
  reliability: NpcReliability;
  intimidation: NpcIntimidation;
  credibilityCue: string;
  facts: readonly Fact[];
  topics: readonly Topic[];
  regionId: RegionId;
  position: readonly [number, number, number];
}>;

export type CandidateFrog = Readonly<{
  id: FrogId;
  name: string;
  description: string;
  features: FrogFeatures;
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
