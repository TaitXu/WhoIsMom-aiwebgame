import type { AgentState, NpcIntimidation, NpcReliability, Personality } from "../../core/types";
import type { NpcDefinition } from "../case/caseTypes";

export type ConversationOutcome = "memory" | "nothing" | "panic";

export function evaluateConversationRisk(
  agent: Pick<AgentState, "personality" | "fatigue">,
  npc: Pick<NpcDefinition, "id" | "reliability" | "intimidation">,
  taskId: string,
  sessionSeed: number,
): ConversationOutcome {
  let mismatch = mismatchScore(agent.personality, npc.intimidation, npc.reliability);
  if (agent.fatigue >= 70 && npc.intimidation !== "none") mismatch += 1;
  if (mismatch === 0) return "memory";

  const roll = hash(`${sessionSeed}:${taskId}:${npc.id}:${agent.personality}`) % 100;
  if (mismatch >= 3) return roll < 45 ? "panic" : roll < 85 ? "nothing" : "memory";
  if (mismatch === 2) return roll < 20 ? "panic" : roll < 65 ? "nothing" : "memory";
  return roll < 38 ? "nothing" : "memory";
}

function mismatchScore(personality: Personality, intimidation: NpcIntimidation, reliability: NpcReliability): number {
  let score = 0;
  if (personality === "cautious" && intimidation === "high") score += 3;
  else if (personality === "cautious" && intimidation === "mild") score += 2;
  else if (personality === "social" && intimidation === "high") score += 1;
  if (personality === "cautious" && reliability === "rumor-prone") score += 1;
  if (personality === "impulsive" && reliability === "steady") score += 1;
  return score;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
