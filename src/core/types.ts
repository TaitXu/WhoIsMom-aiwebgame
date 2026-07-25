export type AgentId = "modian" | "xiaolang" | "paopao";
export type NpcId = "dragonfly" | "turtle" | "crab" | "grasshopper";
export type FrogId = "tree-frog" | "bullfrog" | "marsh-frog";
export type FrogBodyTone = "blue-green" | "olive-green" | "olive-brown";
export type FrogBellyTone = "cream" | "warm-yellow";
export type FrogEyeTone = "red-brown" | "amber";
export type FrogMarkingPattern = "sparse-dark" | "dense-light";
export type FrogHeadAdornment = "leaf-hat" | "reed-crown";
export type FrogRedAdornment = "ankle-ribbons" | "scarf" | "flower-pin";
export type FrogHindLegShape = "slender" | "sturdy";
export type FrogFeatures = Readonly<{
  bodyTone: FrogBodyTone;
  bellyTone: FrogBellyTone;
  eyeTone: FrogEyeTone;
  markingPattern: FrogMarkingPattern;
  headAdornment: FrogHeadAdornment;
  redAdornment: FrogRedAdornment;
  hindLegShape: FrogHindLegShape;
}>;
export type FrogFeatureVocabulary = Readonly<{
  bodyTone: readonly FrogBodyTone[];
  bellyTone: readonly FrogBellyTone[];
  eyeTone: readonly FrogEyeTone[];
  markingPattern: readonly FrogMarkingPattern[];
  headAdornment: readonly FrogHeadAdornment[];
  redAdornment: readonly FrogRedAdornment[];
  hindLegShape: readonly FrogHindLegShape[];
}>;
export type FrogFeatureConstraints = Readonly<Partial<Record<FrogId, Readonly<Partial<FrogFeatures>>>>>;
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
export type CommunicationStyle = "literal" | "embellishing" | "agreeable";
export type Emotion = "calm" | "excited" | "afraid";
export type MemoryConfidence = "believed" | "questioned" | "confirmed";
export type MemoryFidelity = "detailed" | "compressed" | "fragmented";
export type MemoryTransmission = "direct" | "retold" | "mixed";
export type NpcReliability = "steady" | "contextual" | "rumor-prone";
export type NpcIntimidation = "none" | "mild" | "high";
export type AgentResultSource = "model" | "fallback";
export type JumpKnowledge = "none" | "partial" | "learned";

export type GeneratedCast = Readonly<{
  agents: Record<AgentId, Readonly<{ name: string; personality: Personality; introduction: string }>>;
  frogs: Record<FrogId, Readonly<{ name: string; appearance: string; features: FrogFeatures }>>;
}>;

export type Fact = Readonly<{
  id: FactId;
  topic: Topic;
  value: string;
  time?: string;
  place?: string;
  source?: string;
  veracity?: "true" | "contextual" | "false";
  requiresAnyFactIds?: FactId[];
}>;

export type Memory = Readonly<{
  id: MemoryId;
  factIds: FactId[];
  topic: Topic;
  summary: string;
  rememberedSource: string;
  sourceNpcId: NpcId;
  sourceNpcIds: NpcId[];
  emotion: Emotion;
  confidence: MemoryConfidence;
  fidelity: MemoryFidelity;
  transmission: MemoryTransmission;
  strength: number;
  createdAt: number;
  reinforced: boolean;
  parentMemoryIds?: MemoryId[];
  resultSource: AgentResultSource;
}>;

export type AgentUtterance = Readonly<{
  text: string;
  kind: "idle" | "autonomous" | "peer" | "tired";
  expiresAt: number;
}>;

export type InvestigationTask = Readonly<{
  type: "investigation";
  id: string;
  npcId: NpcId;
  topic: Topic;
  autonomous: boolean;
  viaGateId?: GateId;
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
  communicationStyle: CommunicationStyle;
  mode: AgentMode;
  memories: Array<Memory | null>;
  memoryCapacity: 3 | 4 | 5;
  fatigue: number;
  jumpKnowledge: JumpKnowledge;
  utterance?: AgentUtterance;
  activeTask?: AgentTask;
  returnGateId?: GateId;
};

export type GamePhase = "explore" | "ending";

export type DiscussionState = Readonly<{
  id: string;
  agentIds: [AgentId, AgentId];
  topic: Topic;
  autonomous: boolean;
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
  selectedAgentIds: AgentId[];
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
  candidateFrogsRevealed: boolean;
  agents: Record<AgentId, AgentState>;
  generatedCast?: GeneratedCast;
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
  | { type: "SELECT_AGENTS"; agentIds: AgentId[] }
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
  | { type: "START_GATE_SCOUT"; agentId: AgentId; task: InvestigationTask; gateId: GateId }
  | { type: "FINISH_GATE_JUMP"; agentId: AgentId; taskId: string }
  | { type: "RESUME_INVESTIGATION"; agentId: AgentId; taskId: string }
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
  | {
      type: "FAIL_INVESTIGATION";
      agentId: AgentId;
      taskId: string;
      forgetMemoryId?: MemoryId;
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
  | { type: "ADD_FATIGUE"; agentIds: AgentId[]; amount: number; reason: "movement" | "conversation" }
  | { type: "DECAY_MEMORIES"; amount: number }
  | { type: "STORE_MEMORY"; agentId: AgentId; memory: Memory; slot: number }
  | { type: "SET_AGENT_UTTERANCE"; agentId: AgentId; utterance: AgentUtterance }
  | { type: "RECALL_AGENT"; agentId: AgentId }
  | { type: "FINISH_GATE_RETURN"; agentId: AgentId; gateId: GateId }
  | { type: "FINISH_RETURN"; agentId: AgentId }
  | { type: "START_DISCUSSION"; discussion: DiscussionState }
  | {
      type: "COMPLETE_DISCUSSION";
      discussionId: string;
      updates: MemoryUpdate[];
      evidence: EvidenceEvent;
    }
  | { type: "SET_OBJECTIVE"; objective: string }
  | { type: "APPLY_GENERATED_CAST"; cast: GeneratedCast }
  | { type: "REVEAL_CANDIDATE_FROGS" }
  | { type: "CHOOSE_MOTHER"; frogId: FrogId; correct: boolean }
  | { type: "DEMO_ENDING"; frogId: FrogId; correct: boolean }
  | { type: "RESET_GAME" };
