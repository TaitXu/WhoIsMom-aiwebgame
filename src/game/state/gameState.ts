import type { AgentId, AgentState, GameState, Personality } from "../../core/types";

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
    mode: "following",
    memories: [null, null, null],
  };
}

export function createInitialGameState(): GameState {
  const agents = Object.fromEntries(
    agentDefinitions.map(({ id, name, personality }) => [
      id,
      createAgentState(id, name, personality),
    ]),
  ) as Record<AgentId, AgentState>;

  return {
    phase: "explore",
    actionsLeft: 7,
    atPond: false,
    agents,
    objective: "带着小队沿河寻找目击者",
    evidenceLog: [],
    revision: 0,
  };
}
