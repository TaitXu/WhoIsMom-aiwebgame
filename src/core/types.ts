export type AgentId = "modian" | "xiaolang" | "paopao";
export type NpcId = "dragonfly" | "turtle" | "crab" | "grasshopper";
export type FrogId = "tree-frog" | "bullfrog" | "marsh-frog";
export type RegionId =
  | "rainleaf-pool"
  | "dragonfly-shoal"
  | "spring-grassbank"
  | "pebble-bend"
  | "hatching-pool"
  | "turtle-reedbank"
  | "mudflat"
  | "lotus-causeway"
  | "crescent-reed-bay";
export type ObstacleId =
  | "tangled-reeds"
  | "petal-drift"
  | "driftwood-jam"
  | "silt-bubbles"
  | "fallen-rushes"
  | "lily-clutter";
export type GateId = "dragonfly-gap" | "lotus-gate";
export type FactId = string;
export type MemoryId = string;

export type Topic = "appearance" | "location" | "source" | "jump";
export type AgentMode =
  | "following"
  | "considering"
  | "approaching"
  | "interacting"
  | "working"
  | "teaching"
  | "jumping"
  | "returning"
  | "discussing"
  | "tired";

export type Personality = "cautious" | "impulsive" | "social";
export type Emotion = "calm" | "excited" | "afraid";
export type MemoryConfidence = "believed" | "questioned" | "confirmed";
export type AgentResultSource = "model" | "fallback";
export type JumpKnowledge = "none" | "partial" | "learned";

export type Fact = Readonly<{
  id: FactId;
  topic: Topic;
  value: string;
  time?: string;
  place?: string;
  source?: string;
}>;

export type Memory = Readonly<{
  id: MemoryId;
  factIds: FactId[];
  topic: Topic;
  summary: string;
  rememberedSource: string;
  sourceNpcId: NpcId;
  emotion: Emotion;
  confidence: MemoryConfidence;
  createdAt: number;
  reinforced: boolean;
  resultSource: AgentResultSource;
}>;

export type InvestigationTask = Readonly<{
  type: "investigation";
  id: string;
  npcId: NpcId;
  topic: Topic;
  autonomous: boolean;
}>;

export type CleanupTask = Readonly<{
  type: "cleanup";
  id: string;
  obstacleId: ObstacleId;
  participantIds: AgentId[];
}>;

export type AgentTask = InvestigationTask | CleanupTask;

export type AgentState = {
  id: AgentId;
  name: string;
  personality: Personality;
  mode: AgentMode;
  memories: Array<Memory | null>;
  memoryCapacity: 3 | 4 | 5;
  fatigue: number;
  jumpKnowledge: JumpKnowledge;
  activeTask?: AgentTask;
};

export type GamePhase = "explore" | "ending";

export type DiscussionState = Readonly<{
  id: string;
  agentIds: [AgentId, AgentId];
  topic: Topic;
}>;

export type EvidenceEvent = Readonly<{
  id: string;
  kind: "investigation" | "discussion" | "cleanup" | "ability";
  agentIds: AgentId[];
  topic?: Topic;
  summary: string;
  sourceLabel: string;
  sourceNpcIds?: NpcId[];
  createdAt: number;
}>;

export type EndingState = Readonly<{
  selectedMotherId: FrogId;
  correct: boolean;
}>;

export type GameState = {
  phase: GamePhase;
  sessionSeed: number;
  inspiration: number;
  selectedAgentId?: AgentId;
  currentRegionId: RegionId;
  discoveredRegionIds: RegionId[];
  discoveredEntityIds: string[];
  clearedObstacleIds: ObstacleId[];
  scoutedGateIds: GateId[];
  nearbyNpcId?: NpcId;
  nearbyFrogId?: FrogId;
  nearbyObstacleId?: ObstacleId;
  nearbyGateId?: GateId;
  atRestSpot: boolean;
  agents: Record<AgentId, AgentState>;
  objective: string;
  evidenceLog: EvidenceEvent[];
  discussion?: DiscussionState;
  ending?: EndingState;
  revision: number;
};

export type MemoryUpdate = Readonly<{
  agentId: AgentId;
  memoryId: MemoryId;
  confidence: MemoryConfidence;
  reinforced: boolean;
}>;

export type GameCommand =
  | { type: "SELECT_AGENT"; agentId?: AgentId }
  | {
      type: "UPDATE_WORLD_CONTEXT";
      regionId: RegionId;
      npcId?: NpcId;
      frogId?: FrogId;
      obstacleId?: ObstacleId;
      gateId?: GateId;
      atRestSpot: boolean;
      discoveredEntityIds: string[];
    }
  | { type: "START_INVESTIGATION"; agentId: AgentId; task: InvestigationTask }
  | { type: "BEGIN_INTERACTION"; agentId: AgentId; taskId: string }
  | {
      type: "COMPLETE_INVESTIGATION";
      agentId: AgentId;
      taskId: string;
      memory: Memory;
      slot: number;
      evidence: EvidenceEvent;
      fatigue: number;
    }
  | { type: "START_CLEANUP"; task: CleanupTask }
  | { type: "BEGIN_WORK"; agentId: AgentId; taskId: string }
  | {
      type: "COMPLETE_CLEANUP";
      taskId: string;
      obstacleId: ObstacleId;
      agentIds: AgentId[];
      inspiration: number;
      fatigue: number;
      evidence: EvidenceEvent;
    }
  | { type: "LEARN_JUMP"; agentId: AgentId; knowledge: JumpKnowledge; evidence: EvidenceEvent }
  | { type: "TEACH_JUMP"; teacherId: AgentId; studentId: AgentId; evidence: EvidenceEvent }
  | { type: "MARK_GATE_SCOUTED"; gateId: GateId }
  | { type: "UPGRADE_MEMORY"; agentId: AgentId }
  | { type: "REST_SQUAD" }
  | { type: "RECALL_AGENT"; agentId: AgentId }
  | { type: "FINISH_RETURN"; agentId: AgentId }
  | { type: "START_DISCUSSION"; discussion: DiscussionState }
  | {
      type: "COMPLETE_DISCUSSION";
      discussionId: string;
      updates: MemoryUpdate[];
      evidence: EvidenceEvent;
    }
  | { type: "SET_OBJECTIVE"; objective: string }
  | { type: "CHOOSE_MOTHER"; frogId: FrogId; correct: boolean }
  | { type: "RESET_GAME" };
