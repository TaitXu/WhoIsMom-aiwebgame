import type { AgentId, AgentState, GameState, Personality } from "../../core/types";
import { communicationStyleByPersonality } from "../agents/personality";

const agentDefinitions: Array<{
  id: AgentId;
  name: string;
  personality: Personality;
}> = [
  { id: "modian", name: "墨点", personality: "cautious" },
  { id: "xiaolang", name: "小浪", personality: "impulsive" },
  { id: "paopao", name: "泡泡", personality: "social" },
];

function createAgentState(id: AgentId, name: string, personality: Personality): AgentState {
  return {
    id,
    name,
    personality,
    communicationStyle: communicationStyleByPersonality[personality],
    mode: "following",
    memories: [null, null, null],
    memoryCapacity: 3,
    fatigue: 0,
    jumpKnowledge: "none",
  };
}

export function createInitialGameState(sessionSeed = 73129): GameState {
  const agents = Object.fromEntries(
    agentDefinitions.map(({ id, name, personality }) => [id, createAgentState(id, name, personality)]),
  ) as Record<AgentId, AgentState>;

  return {
    phase: "explore",
    sessionSeed,
    inspiration: 0,
    currentRegionId: "hatching-pool",
    discoveredRegionIds: ["hatching-pool"],
    discoveredEntityIds: [],
    clearedObstacleIds: [],
    scoutedGateIds: [],
    atRestSpot: true,
    candidateFrogsRevealed: false,
    agents,
    objective: "从孵化静池出发，认识这片相连的水乡",
    evidenceLog: [],
    revision: 0,
    selectedAgentIds: [],
  };
}
