import type {
  AgentId,
  Emotion,
  Fact,
  FactId,
  Memory,
  Personality,
  Topic,
} from "../core/types";

export type EncodeMemoryRequest = {
  requestId: string;
  task: "encode_memory";
  agent: {
    id: AgentId;
    personality: Personality;
  };
  npc: {
    id: string;
    name: string;
  };
  topic: Topic;
  allowedFacts: Fact[];
  memories: Array<Memory | null>;
};

export type ReconcileMemoriesRequest = {
  requestId: string;
  task: "reconcile_memories";
  agentIds: [AgentId, AgentId];
  personalities: [Personality, Personality];
  topic: Topic;
  memories: Memory[];
};

export type AgentRequest = EncodeMemoryRequest | ReconcileMemoriesRequest;

export type EncodeMemoryResult = {
  task: "encode_memory";
  selectedFactIds: FactId[];
  omittedFields: Array<"time" | "place" | "source">;
  suggestedSlot: 0 | 1 | 2;
  tone: Emotion;
  spokenSummary: string;
};

export type ReconcileMemoriesResult = {
  task: "reconcile_memories";
  outcome: "reinforce" | "question" | "revise";
  acceptedMemoryIds: string[];
  questionedMemoryIds: string[];
  spokenSummary: string;
};

export type AgentResult = EncodeMemoryResult | ReconcileMemoriesResult;

export type AgentResponse = {
  requestId: string;
  source: "model" | "fallback";
  result: AgentResult;
};

const agentIds = new Set<AgentId>(["modian", "xiaolang", "paopao"]);
const personalities = new Set<Personality>(["cautious", "impulsive", "social"]);
const topics = new Set<Topic>(["appearance", "location", "source"]);
const emotions = new Set<Emotion>(["calm", "excited", "afraid"]);
const allowedOmissions = new Set(["time", "place", "source"]);
const outcomes = new Set(["reinforce", "question", "revise"]);

export function validateAgentRequest(value: unknown): AgentRequest | null {
  if (!isRecord(value) || !isRequestId(value.requestId) || typeof value.task !== "string") return null;

  if (value.task === "encode_memory") {
    if (!isRecord(value.agent) || !isRecord(value.npc)) return null;
    if (!agentIds.has(value.agent.id as AgentId)) return null;
    if (!personalities.has(value.agent.personality as Personality)) return null;
    if (typeof value.npc.id !== "string" || typeof value.npc.name !== "string") return null;
    if (!topics.has(value.topic as Topic)) return null;
    if (!Array.isArray(value.allowedFacts) || value.allowedFacts.length === 0 || value.allowedFacts.length > 8) return null;
    if (!value.allowedFacts.every(isFact)) return null;
    if (!value.allowedFacts.every((fact) => fact.topic === value.topic)) return null;
    if (!isMemoryList(value.memories, true)) return null;
    return value as EncodeMemoryRequest;
  }

  if (value.task === "reconcile_memories") {
    if (!Array.isArray(value.agentIds) || value.agentIds.length !== 2) return null;
    if (!value.agentIds.every((id) => agentIds.has(id as AgentId)) || value.agentIds[0] === value.agentIds[1]) return null;
    if (!Array.isArray(value.personalities) || value.personalities.length !== 2) return null;
    if (!value.personalities.every((personality) => personalities.has(personality as Personality))) return null;
    if (!topics.has(value.topic as Topic)) return null;
    if (!isMemoryList(value.memories, false) || value.memories.length === 0 || value.memories.length > 6) return null;
    return value as ReconcileMemoriesRequest;
  }

  return null;
}

export function validateAgentResult(request: AgentRequest, value: unknown): AgentResult | null {
  if (!isRecord(value) || value.task !== request.task) return null;
  if (request.task === "encode_memory") return validateEncodeResult(request, value);
  return validateReconcileResult(request, value);
}

function validateEncodeResult(
  request: EncodeMemoryRequest,
  value: Record<string, unknown>,
): EncodeMemoryResult | null {
  const allowedIds = new Set(request.allowedFacts.map((fact) => fact.id));
  if (!isStringArray(value.selectedFactIds) || value.selectedFactIds.length === 0) return null;
  if (!value.selectedFactIds.every((id) => allowedIds.has(id))) return null;
  if (!isStringArray(value.omittedFields)) return null;
  if (!value.omittedFields.every((field) => allowedOmissions.has(field))) return null;
  if (value.suggestedSlot !== 0 && value.suggestedSlot !== 1 && value.suggestedSlot !== 2) return null;
  if (typeof value.tone !== "string" || !emotions.has(value.tone as Emotion)) return null;
  if (!isSummary(value.spokenSummary)) return null;

  return {
    task: "encode_memory",
    selectedFactIds: value.selectedFactIds,
    omittedFields: value.omittedFields as Array<"time" | "place" | "source">,
    suggestedSlot: value.suggestedSlot,
    tone: value.tone as Emotion,
    spokenSummary: value.spokenSummary,
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
  if (!isSummary(value.spokenSummary)) return null;

  return {
    task: "reconcile_memories",
    outcome: value.outcome as ReconcileMemoriesResult["outcome"],
    acceptedMemoryIds: value.acceptedMemoryIds,
    questionedMemoryIds: value.questionedMemoryIds,
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
    optionalString(value.source)
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
    typeof value.emotion === "string" &&
    typeof value.confidence === "string" &&
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

function isSummary(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}
