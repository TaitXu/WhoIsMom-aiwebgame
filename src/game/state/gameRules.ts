import type { AgentId, GameCommand, GameState, Memory } from "../../core/types";
import { assertNever } from "../../core/assert";
import { createInitialGameState } from "./gameState";

export function reduceGameState(state: GameState, command: GameCommand): GameState {
  switch (command.type) {
    case "SELECT_AGENT":
      return bump(state, { selectedAgentId: command.agentId });
    case "SET_PROXIMITY":
      if (state.nearbyNpcId === command.npcId && state.atPond === command.atPond) return state;
      return bump(state, { nearbyNpcId: command.npcId, atPond: command.atPond });
    case "START_INVESTIGATION": {
      const agent = state.agents[command.agentId];
      if (state.phase !== "explore" || state.actionsLeft <= 0 || agent.mode !== "following") return state;
      return updateAgent(state, command.agentId, (current) => ({
        ...current,
        mode: "approaching",
        activeTask: command.task,
      }));
    }
    case "BEGIN_INTERACTION":
      return updateTaskAgent(state, command.agentId, command.taskId, (agent) => ({
        ...agent,
        mode: "interacting",
      }));
    case "COMPLETE_INVESTIGATION": {
      if (state.phase !== "explore") return state;
      const agent = state.agents[command.agentId];
      if (agent.activeTask?.id !== command.taskId || agent.mode !== "interacting") return state;
      const memories = [...agent.memories] as typeof agent.memories;
      memories[command.slot] = command.memory;
      const actionsLeft = Math.max(0, state.actionsLeft - 1);
      return bump(state, {
        actionsLeft,
        agents: {
          ...state.agents,
          [command.agentId]: {
            ...agent,
            mode: "returning",
            activeTask: undefined,
            memories,
          },
        },
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective:
          actionsLeft === 0
            ? "天色暗了，前往月牙荷塘选择妈妈"
            : `${agent.name}带回了一条记忆`,
      });
    }
    case "RECALL_AGENT": {
      const agent = state.agents[command.agentId];
      if (agent.mode !== "approaching" && agent.mode !== "interacting") return state;
      return updateAgent(state, command.agentId, (current) => ({
        ...current,
        mode: "returning",
        activeTask: undefined,
      }));
    }
    case "FINISH_RETURN":
      return updateAgent(state, command.agentId, (agent) =>
        agent.mode === "returning" ? { ...agent, mode: "following" } : agent,
      );
    case "START_DISCUSSION": {
      const [firstId, secondId] = command.discussion.agentIds;
      if (
        state.phase !== "explore" ||
        state.actionsLeft <= 0 ||
        state.discussion ||
        firstId === secondId ||
        state.agents[firstId].mode !== "following" ||
        state.agents[secondId].mode !== "following"
      ) {
        return state;
      }
      return bump(state, {
        discussion: command.discussion,
        agents: {
          ...state.agents,
          [firstId]: { ...state.agents[firstId], mode: "discussing" },
          [secondId]: { ...state.agents[secondId], mode: "discussing" },
        },
        objective: `${state.agents[firstId].name}和${state.agents[secondId].name}正在对证`,
      });
    }
    case "COMPLETE_DISCUSSION": {
      if (state.discussion?.id !== command.discussionId) return state;
      const nextAgents = { ...state.agents };
      state.discussion.agentIds.forEach((agentId) => {
        nextAgents[agentId] = { ...nextAgents[agentId], mode: "following" };
      });
      command.updates.forEach((update) => {
        const agent = nextAgents[update.agentId];
        const memories = agent.memories.map((memory) =>
          memory?.id === update.memoryId
            ? ({
                ...memory,
                confidence: update.confidence,
                reinforced: update.reinforced,
              } satisfies Memory)
            : memory,
        ) as typeof agent.memories;
        nextAgents[update.agentId] = { ...agent, memories };
      });
      const actionsLeft = Math.max(0, state.actionsLeft - 1);
      return bump(state, {
        actionsLeft,
        agents: nextAgents,
        discussion: undefined,
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective:
          actionsLeft === 0
            ? "天色暗了，前往月牙荷塘选择妈妈"
            : command.evidence.summary,
      });
    }
    case "SET_OBJECTIVE":
      return state.objective === command.objective ? state : bump(state, { objective: command.objective });
    case "CHOOSE_MOTHER":
      if (state.phase === "ending") return state;
      return bump(state, {
        phase: "ending",
        ending: { selectedMotherId: command.frogId, correct: command.correct },
        objective: command.correct ? "你们找到了真正的妈妈" : "这只青蛙不是它们的妈妈",
      });
    case "RESET_GAME":
      return createInitialGameState();
    default:
      return assertNever(command);
  }
}

function updateTaskAgent(
  state: GameState,
  agentId: AgentId,
  taskId: string,
  update: (agent: GameState["agents"][AgentId]) => GameState["agents"][AgentId],
): GameState {
  const agent = state.agents[agentId];
  if (agent.activeTask?.id !== taskId) return state;
  return updateAgent(state, agentId, update);
}

function updateAgent(
  state: GameState,
  agentId: AgentId,
  update: (agent: GameState["agents"][AgentId]) => GameState["agents"][AgentId],
): GameState {
  const current = state.agents[agentId];
  const next = update(current);
  if (next === current) return state;
  return bump(state, {
    agents: {
      ...state.agents,
      [agentId]: next,
    },
  });
}

function bump(state: GameState, update: Partial<GameState>): GameState {
  return {
    ...state,
    ...update,
    revision: state.revision + 1,
  };
}
