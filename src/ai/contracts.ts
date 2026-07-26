import type {
  AgentId,
  CommunicationStyle,
  Emotion,
  Fact,
  FactId,
  FrogId,
  HiddenPersonalityProfile,
  Memory,
  NpcId,
  Personality,
  Topic,
} from "../core/types";
import { frogNameRevealsFeature } from "../game/case/frogFeatures";

export type EncodeMemoryRequest = {
  requestId: string;
  task: "encode_memory";
  agent: {
    id: AgentId;
    personality: Personality;
    communicationStyle: CommunicationStyle;
    fatigue: number;
    hiddenProfile?: HiddenPersonalityProfile;
  };
  npc: {
    id: string;
    name: string;
  };
  topic: Topic;
  allowedFacts: Fact[];
  memories: Array<Memory | null>;
  conversationHistory?: string[];
  seenFactIds?: FactId[];
  turnIndex?: number;
};

export type ReconcileMemoriesRequest = {
  requestId: string;
  task: "reconcile_memories";
  agentIds: [AgentId, AgentId];
  personalities: [Personality, Personality];
  hiddenProfiles?: [HiddenPersonalityProfile | undefined, HiddenPersonalityProfile | undefined];
  discussionHistory?: string[];
  topic: Topic;
  memories: Memory[];
};

export type JudgeJumpLearningRequest = {
  requestId: string;
  task: "judge_jump_learning";
  agent: {
    id: AgentId;
    personality: Personality;
    hiddenProfile?: HiddenPersonalityProfile;
  };
  trainingSourceNpcId: NpcId;
  trainingSummary: string;
  memories: Memory[];
};

export type MovementBehavior =
  | "stay_close" | "scout_ahead" | "wander" | "orbit_companion"
  | "inspect_target" | "lag_behind" | "avoid_target" | "return_to_player";

export type MovementDecisionRequest = {
  requestId: string;
  task: "decide_movement_intent";
  agent: { id: AgentId; personality: Personality };
  playerDistance: number;
  visibleTargetIds: string[];
  currentBehavior?: MovementBehavior;
};

export type GenerateCastRequest = {
  requestId: string;
  task: "generate_cast";
  seed: number;
  agentIds: AgentId[];
  frogIds: FrogId[];
  motherId: FrogId;
};

export type AgentRequest = EncodeMemoryRequest | ReconcileMemoriesRequest | JudgeJumpLearningRequest | MovementDecisionRequest | GenerateCastRequest;

export type EncodeMemoryResult = {
  task: "encode_memory";
  selectedFactIds: FactId[];
  omittedFields: Array<"time" | "place" | "source">;
  suggestedSlot: 0 | 1 | 2;
  tone: Emotion;
  fidelity: "detailed" | "compressed" | "fragmented";
  spokenSummary: string;
  afterthought?: string;
};

export type ReconcileMemoriesResult = {
  task: "reconcile_memories";
  outcome: "reinforce" | "question" | "revise";
  acceptedMemoryIds: string[];
  questionedMemoryIds: string[];
  spokenSummary: string;
};

export type JudgeJumpLearningResult = {
  task: "judge_jump_learning";
  outcome: "partial" | "learned";
  relevantMemoryIds: string[];
  spokenSummary: string;
};

export type MovementIntentResult = {
  task: "decide_movement_intent";
  behavior: MovementBehavior;
  targetId?: string;
  durationMs: number;
  distance: "near" | "medium" | "far";
  energy: "calm" | "normal" | "excited";
  spokenLine?: string;
};

export type GenerateCastResult = {
  task: "generate_cast";
  agents: Array<{
    id: AgentId;
    name: string;
    personality: Personality;
    introduction: string;
    hiddenProfile: HiddenPersonalityProfile;
  }>;
  frogs: Array<{ id: FrogId; name: string }>;
};

export type AgentResult = EncodeMemoryResult | ReconcileMemoriesResult | JudgeJumpLearningResult | MovementIntentResult | GenerateCastResult;

export type AgentResponse = {
  requestId: string;
  source: "model" | "fallback";
  result: AgentResult;
};

const agentIds = new Set<AgentId>(["modian", "xiaolang", "paopao"]);
const frogIds = new Set<FrogId>(["tree-frog", "bullfrog", "marsh-frog"]);
const npcIds = new Set<NpcId>(["dragonfly", "turtle", "crab", "grasshopper"]);
const personalities = new Set<Personality>(["cautious", "impulsive", "social"]);
const topics = new Set<Topic>(["appearance", "location", "source", "jump"]);
const emotions = new Set<Emotion>(["calm", "excited", "afraid"]);
const allowedOmissions = new Set(["time", "place", "source"]);
const outcomes = new Set(["reinforce", "question", "revise"]);
const movementBehaviors = new Set<MovementBehavior>([
  "stay_close", "scout_ahead", "wander", "orbit_companion", "inspect_target",
  "lag_behind", "avoid_target", "return_to_player",
]);
const communicationStyles = new Set<CommunicationStyle>(["literal", "embellishing", "agreeable"]);
const forbiddenSpeciesTerms = ["树蛙", "牛蛙", "泽蛙", "雨蛙", "角蛙", "蛙科", "品种"];

export function containsForbiddenSpeciesTerm(value: string): boolean {
  return forbiddenSpeciesTerms.some((term) => value.includes(term));
}

export function validateAgentRequest(value: unknown): AgentRequest | null {
  if (!isRecord(value) || !isRequestId(value.requestId) || typeof value.task !== "string") return null;

  if (value.task === "encode_memory") {
    if (!isRecord(value.agent) || !isRecord(value.npc)) return null;
    if (!agentIds.has(value.agent.id as AgentId)) return null;
    if (!personalities.has(value.agent.personality as Personality)) return null;
    if (!communicationStyles.has(value.agent.communicationStyle as CommunicationStyle)) return null;
    if (typeof value.agent.fatigue !== "number" || !Number.isFinite(value.agent.fatigue) || value.agent.fatigue < 0 || value.agent.fatigue > 100) return null;
    if (typeof value.npc.id !== "string" || typeof value.npc.name !== "string") return null;
    if (!topics.has(value.topic as Topic)) return null;
    if (!Array.isArray(value.allowedFacts) || value.allowedFacts.length === 0 || value.allowedFacts.length > 8) return null;
    if (!value.allowedFacts.every(isFact)) return null;
    if (!value.allowedFacts.every((fact) => fact.topic === value.topic)) return null;
    if (!isMemoryList(value.memories, true)) return null;
    if (value.conversationHistory !== undefined && (!isStringArray(value.conversationHistory) || value.conversationHistory.length > 8 || !value.conversationHistory.every(isSummary))) return null;
    if (value.seenFactIds !== undefined && (!isStringArray(value.seenFactIds) || value.seenFactIds.length > 24)) return null;
    if (value.turnIndex !== undefined && (typeof value.turnIndex !== "number" || !Number.isInteger(value.turnIndex) || value.turnIndex < 0 || value.turnIndex > 100)) return null;
    if (value.agent.hiddenProfile !== undefined && !isHiddenProfile(value.agent.hiddenProfile)) return null;
    return value as EncodeMemoryRequest;
  }

  if (value.task === "reconcile_memories") {
    if (!Array.isArray(value.agentIds) || value.agentIds.length !== 2) return null;
    if (!value.agentIds.every((id) => agentIds.has(id as AgentId)) || value.agentIds[0] === value.agentIds[1]) return null;
    if (!Array.isArray(value.personalities) || value.personalities.length !== 2) return null;
    if (!value.personalities.every((personality) => personalities.has(personality as Personality))) return null;
    if (!topics.has(value.topic as Topic)) return null;
    if (!isMemoryList(value.memories, false) || value.memories.length === 0 || value.memories.length > 6) return null;
    if (value.hiddenProfiles !== undefined && (!Array.isArray(value.hiddenProfiles) || value.hiddenProfiles.length !== 2 || !value.hiddenProfiles.every((profile) => profile === undefined || isHiddenProfile(profile)))) return null;
    if (value.discussionHistory !== undefined && (!isStringArray(value.discussionHistory) || value.discussionHistory.length > 6 || !value.discussionHistory.every(isSummary))) return null;
    return value as ReconcileMemoriesRequest;
  }

  if (value.task === "judge_jump_learning") {
    if (!isRecord(value.agent)) return null;
    if (!agentIds.has(value.agent.id as AgentId)) return null;
    if (!personalities.has(value.agent.personality as Personality)) return null;
    if (!npcIds.has(value.trainingSourceNpcId as NpcId) || !isSummary(value.trainingSummary)) return null;
    if (value.agent.hiddenProfile !== undefined && !isHiddenProfile(value.agent.hiddenProfile)) return null;
    if (!isMemoryList(value.memories, false) || value.memories.length > 5) return null;
    return value as JudgeJumpLearningRequest;
  }

  if (value.task === "decide_movement_intent") {
    if (!isRecord(value.agent)) return null;
    if (!agentIds.has(value.agent.id as AgentId) || !personalities.has(value.agent.personality as Personality)) return null;
    if (typeof value.playerDistance !== "number" || !Number.isFinite(value.playerDistance) || value.playerDistance < 0 || value.playerDistance > 100) return null;
    if (!isStringArray(value.visibleTargetIds) || value.visibleTargetIds.length > 24) return null;
    if (value.currentBehavior !== undefined && !movementBehaviors.has(value.currentBehavior as MovementBehavior)) return null;
    return value as MovementDecisionRequest;
  }

  if (value.task === "generate_cast") {
    if (typeof value.seed !== "number" || !Number.isFinite(value.seed)) return null;
    if (!isIdArray(value.agentIds, agentIds) || !isIdArray(value.frogIds, frogIds)) return null;
    if (value.agentIds.length !== agentIds.size || new Set(value.agentIds).size !== agentIds.size) return null;
    if (value.frogIds.length !== frogIds.size || new Set(value.frogIds).size !== frogIds.size) return null;
    if (!frogIds.has(value.motherId as FrogId) || !(value.frogIds as FrogId[]).includes(value.motherId as FrogId)) return null;
    return value as GenerateCastRequest;
  }

  return null;
}

export function validateAgentResult(request: AgentRequest, value: unknown): AgentResult | null {
  if (!isRecord(value) || value.task !== request.task) return null;
  if (request.task === "encode_memory") return validateEncodeResult(request, value);
  if (request.task === "reconcile_memories") return validateReconcileResult(request, value);
  if (request.task === "judge_jump_learning") return validateJumpLearningResult(request, value);
  if (request.task === "decide_movement_intent") return validateMovementIntentResult(request, value);
  return validateGenerateCastResult(request, value);
}

function validateMovementIntentResult(
  request: MovementDecisionRequest,
  value: Record<string, unknown>,
): MovementIntentResult | null {
  if (!movementBehaviors.has(value.behavior as MovementBehavior)) return null;
  if (value.targetId !== undefined && (typeof value.targetId !== "string" || !request.visibleTargetIds.includes(value.targetId))) return null;
  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs < 1_000 || value.durationMs > 20_000) return null;
  if (value.distance !== "near" && value.distance !== "medium" && value.distance !== "far") return null;
  if (value.energy !== "calm" && value.energy !== "normal" && value.energy !== "excited") return null;
  if (value.spokenLine !== undefined && !isSafeSummary(value.spokenLine)) return null;
  return {
    task: "decide_movement_intent",
    behavior: value.behavior as MovementBehavior,
    targetId: value.targetId as string | undefined,
    durationMs: value.durationMs,
    distance: value.distance,
    energy: value.energy,
    spokenLine: value.spokenLine as string | undefined,
  };
}

function validateGenerateCastResult(
  request: GenerateCastRequest,
  value: Record<string, unknown>,
): GenerateCastResult | null {
  if (!Array.isArray(value.agents) || value.agents.length !== request.agentIds.length) return null;
  if (!Array.isArray(value.frogs) || value.frogs.length !== request.frogIds.length) return null;
  const agentSet = new Set(request.agentIds);
  const frogSet = new Set(request.frogIds);
  if (!value.agents.every((item) => isRecord(item) && agentSet.has(item.id as AgentId) && personalities.has(item.personality as Personality) && isSafeSummary(item.name) && isSafeSummary(item.introduction) && isHiddenProfile(item.hiddenProfile))) return null;
  if (!value.frogs.every((item) => (
    isRecord(item)
    && frogSet.has(item.id as FrogId)
    && isSafeSummary(item.name)
    && !frogNameRevealsFeature(item.name)
  ))) return null;
  if (new Set(value.agents.map((item) => (item as Record<string, unknown>).id)).size !== value.agents.length) return null;
  if (new Set(value.frogs.map((item) => (item as Record<string, unknown>).id)).size !== value.frogs.length) return null;
  if (new Set(value.frogs.map((item) => (item as Record<string, unknown>).name)).size !== value.frogs.length) return null;
  if (new Set(value.agents.map((item) => (item as Record<string, unknown>).personality)).size !== personalities.size) return null;
  return {
    task: "generate_cast",
    agents: value.agents.map((item) => item as GenerateCastResult["agents"][number]),
    frogs: value.frogs.map((item) => item as GenerateCastResult["frogs"][number]),
  };
}

function validateEncodeResult(
  request: EncodeMemoryRequest,
  value: Record<string, unknown>,
): EncodeMemoryResult | null {
  const allowedIds = new Set(request.allowedFacts.map((fact) => fact.id));
  if (!isStringArray(value.selectedFactIds) || value.selectedFactIds.length !== 1) return null;
  if (!value.selectedFactIds.every((id) => allowedIds.has(id))) return null;
  const omittedFields = value.omittedFields;
  if (!isStringArray(omittedFields)) return null;
  if (!omittedFields.every((field) => allowedOmissions.has(field))) return null;
  if (omittedFields.length === 0) return null;
  if (value.suggestedSlot !== 0 && value.suggestedSlot !== 1 && value.suggestedSlot !== 2) return null;
  if (typeof value.tone !== "string" || !emotions.has(value.tone as Emotion)) return null;
  if (value.fidelity !== "detailed" && value.fidelity !== "compressed" && value.fidelity !== "fragmented") return null;
  if (request.agent.fatigue >= 70 && value.fidelity !== "fragmented") return null;
  if (request.agent.fatigue >= 70 && !["time", "place", "source"].every((field) => omittedFields.includes(field))) return null;
  if (request.agent.fatigue >= 45 && request.agent.fatigue < 70 && value.fidelity === "detailed") return null;
  if (!isSafeSummary(value.spokenSummary)) return null;
  if (value.afterthought !== undefined && !isSafeSummary(value.afterthought)) return null;

  return {
    task: "encode_memory",
    selectedFactIds: value.selectedFactIds,
    omittedFields: omittedFields as Array<"time" | "place" | "source">,
    suggestedSlot: value.suggestedSlot,
    tone: value.tone as Emotion,
    fidelity: value.fidelity,
    spokenSummary: value.spokenSummary,
    afterthought: value.afterthought as string | undefined,
  };
}

function validateReconcileResult(
  request: ReconcileMemoriesRequest,
  value: Record<string, unknown>,
): ReconcileMemoriesResult | null {
  const allowedIds = new Set(request.memories.map((memory) => memory.id));
  if (typeof value.outcome !== "string" || !outcomes.has(value.outcome)) return null;
  if (!isStringArray(value.acceptedMemoryIds) || !isStringArray(value.questionedMemoryIds)) return null;
  if (![...value.acceptedMemoryIds, ...value.questionedMemoryIds].every((id) => allowedIds.has(id))) return null;
  if (!isSafeSummary(value.spokenSummary)) return null;

  return {
    task: "reconcile_memories",
    outcome: value.outcome as ReconcileMemoriesResult["outcome"],
    acceptedMemoryIds: value.acceptedMemoryIds,
    questionedMemoryIds: value.questionedMemoryIds,
    spokenSummary: value.spokenSummary,
  };
}

function validateJumpLearningResult(
  request: JudgeJumpLearningRequest,
  value: Record<string, unknown>,
): JudgeJumpLearningResult | null {
  const allowedIds = new Set(request.memories.map((memory) => memory.id));
  if (value.outcome !== "partial" && value.outcome !== "learned") return null;
  if (request.agent.personality !== "cautious" && value.outcome !== "learned") return null;
  if (!isStringArray(value.relevantMemoryIds)) return null;
  if (!value.relevantMemoryIds.every((id) => allowedIds.has(id))) return null;
  if (!isSafeSummary(value.spokenSummary)) return null;
  return {
    task: "judge_jump_learning",
    outcome: value.outcome,
    relevantMemoryIds: value.relevantMemoryIds,
    spokenSummary: value.spokenSummary,
  };
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 120;
}

function isFact(value: unknown): value is Fact {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    topics.has(value.topic as Topic) &&
    typeof value.value === "string" &&
    optionalString(value.time) &&
    optionalString(value.place) &&
    optionalString(value.source) &&
    (value.veracity === undefined || value.veracity === "true" || value.veracity === "contextual" || value.veracity === "false") &&
    (value.requiresAnyFactIds === undefined || isStringArray(value.requiresAnyFactIds))
  );
}

function isMemoryList(value: unknown, allowNull: boolean): value is Array<Memory | null> {
  return (
    Array.isArray(value) &&
    value.length <= 6 &&
    value.every((item) => (allowNull && item === null) || isMemory(item))
  );
}

function isMemory(value: unknown): value is Memory {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isStringArray(value.factIds) &&
    topics.has(value.topic as Topic) &&
    isSummary(value.summary) &&
    typeof value.rememberedSource === "string" &&
    typeof value.sourceNpcId === "string" &&
    isStringArray(value.sourceNpcIds) &&
    typeof value.emotion === "string" &&
    typeof value.confidence === "string" &&
    (value.fidelity === "detailed" || value.fidelity === "compressed" || value.fidelity === "fragmented") &&
    (value.transmission === "direct" || value.transmission === "retold" || value.transmission === "mixed") &&
    typeof value.strength === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.reinforced === "boolean" &&
    (value.resultSource === "model" || value.resultSource === "fallback")
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isIdArray<T extends string>(value: unknown, allowed: Set<T>): value is T[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && allowed.has(item as T));
}


function isSummary(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

function isHiddenProfile(value: unknown): value is HiddenPersonalityProfile {
  return isRecord(value)
    && isSummary(value.dossier)
    && isSummary(value.speechRules);
}

function isSafeSummary(value: unknown): value is string {
  return isSummary(value) && !containsForbiddenSpeciesTerm(value);
}
