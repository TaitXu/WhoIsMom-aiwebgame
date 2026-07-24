export type AgentId = "modian" | "xiaolang" | "paopao";
export type NpcId = "dragonfly" | "turtle" | "crab";
export type FrogId = "tree-frog" | "bullfrog" | "marsh-frog";
export type FactId = string;
export type MemoryId = string;

export type Topic = "appearance" | "location" | "source";
export type AgentMode =
  | "following"
  | "considering"
  | "approaching"
  | "interacting"
  | "returning"
  | "discussing";

export type Personality = "cautious" | "impulsive" | "social";
export type Emotion = "calm" | "excited" | "afraid";
export type MemoryConfidence = "believed" | "questioned" | "confirmed";
export type AgentResultSource = "model" | "fallback";

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

export type MemorySlots = [Memory | null, Memory | null, Memory | null];

export type InvestigationTask = Readonly<{
  id: string;
  npcId: NpcId;
  topic: Topic;
  autonomous: boolean;
}>;

export type AgentState = {
  id: AgentId;
  name: string;
  personality: Personality;
  mode: AgentMode;
  memories: MemorySlots;
  activeTask?: InvestigationTask;
};

export type GamePhase = "explore" | "choose" | "ending";

export type DiscussionState = Readonly<{
  id: string;
  agentIds: [AgentId, AgentId];
  topic: Topic;
}>;

export type EvidenceEvent = Readonly<{
  id: string;
  kind: "investigation" | "discussion";
  agentIds: AgentId[];
  topic: Topic;
  summary: string;
  sourceLabel: string;
  createdAt: number;
}>;

export type EndingState = Readonly<{
  selectedMotherId: FrogId;
  correct: boolean;
}>;

export type GameState = {
  phase: GamePhase;
  actionsLeft: number;
  selectedAgentId?: AgentId;
  nearbyNpcId?: NpcId;
  atPond: boolean;
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
  | { type: "SET_PROXIMITY"; npcId?: NpcId; atPond: boolean }
  | { type: "START_INVESTIGATION"; agentId: AgentId; task: InvestigationTask }
  | { type: "BEGIN_INTERACTION"; agentId: AgentId; taskId: string }
  | {
      type: "COMPLETE_INVESTIGATION";
      agentId: AgentId;
      taskId: string;
      memory: Memory;
      slot: 0 | 1 | 2;
      evidence: EvidenceEvent;
    }
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
