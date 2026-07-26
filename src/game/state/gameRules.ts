import type { AgentId, GameCommand, GameState, Memory, ObstacleId } from "../../core/types";
import { assertNever } from "../../core/assert";
import { communicationStyleByPersonality } from "../agents/personality";
import { createInitialGameState } from "./gameState";

const MAX_FATIGUE = 100;

export function reduceGameState(state: GameState, command: GameCommand): GameState {
  switch (command.type) {
    case "SELECT_AGENT":
      return bump(state, {
        selectedAgentId: command.agentId,
        selectedAgentIds: command.agentId ? [command.agentId] : [],
      });
    case "SELECT_AGENTS": {
      const agentIds = [...new Set(command.agentIds)].filter((id) => Boolean(state.agents[id]));
      return bump(state, {
        selectedAgentId: agentIds[0],
        selectedAgentIds: agentIds,
      });
    }
    case "UPDATE_WORLD_CONTEXT": {
      const discoveredRegionIds = state.discoveredRegionIds.includes(command.regionId)
        ? state.discoveredRegionIds
        : [...state.discoveredRegionIds, command.regionId];
      const discoveredEntityIds = [...new Set([...state.discoveredEntityIds, ...command.discoveredEntityIds])];
      if (
        state.currentRegionId === command.regionId &&
        state.nearbyNpcId === command.npcId &&
        state.nearbyFrogId === command.frogId &&
        state.nearbyObstacleId === command.obstacleId &&
        state.nearbyGateId === command.gateId &&
        state.atRestSpot === command.atRestSpot &&
        discoveredRegionIds === state.discoveredRegionIds &&
        discoveredEntityIds.length === state.discoveredEntityIds.length
      ) {
        return state;
      }
      return bump(state, {
        currentRegionId: command.regionId,
        discoveredRegionIds,
        discoveredEntityIds,
        nearbyNpcId: command.npcId,
        nearbyFrogId: command.frogId,
        nearbyObstacleId: command.obstacleId,
        nearbyGateId: command.gateId,
        atRestSpot: command.atRestSpot,
      });
    }
    case "START_INVESTIGATION": {
      const agent = state.agents[command.agentId];
      if (state.phase !== "explore" || agent.mode !== "following" || agent.fatigue >= 90) return state;
      return updateAgent(state, command.agentId, (current) => ({
        ...current,
        mode: "approaching",
        activeTask: command.task,
      }));
    }
    case "START_GATE_SCOUT": {
      const agent = state.agents[command.agentId];
      if (
        state.phase !== "explore" ||
        command.gateId !== "dragonfly-gap" ||
        command.task.viaGateId !== command.gateId ||
        command.task.npcId !== "dragonfly" ||
        agent.mode !== "following" ||
        agent.fatigue >= 90 ||
        agent.jumpKnowledge !== "learned"
      ) return state;
      return updateAgent(state, command.agentId, (current) => ({
        ...current,
        mode: "jumping",
        activeTask: command.task,
        returnGateId: undefined,
      }));
    }
    case "FINISH_GATE_JUMP":
      return updateTaskAgent(state, command.agentId, command.taskId, (agent) =>
        agent.mode === "jumping" && agent.activeTask?.type === "investigation" && agent.activeTask.viaGateId
          ? { ...agent, mode: "considering" }
          : agent,
      );
    case "RESUME_INVESTIGATION":
      return updateTaskAgent(state, command.agentId, command.taskId, (agent) =>
        agent.mode === "considering" && agent.activeTask?.type === "investigation" && agent.activeTask.viaGateId
          ? { ...agent, mode: "approaching" }
          : agent,
      );
    case "BEGIN_INTERACTION":
      return updateTaskAgent(state, command.agentId, command.taskId, (agent) => ({
        ...agent,
        mode: "interacting",
      }));
    case "COMPLETE_INVESTIGATION": {
      if (state.phase !== "explore") return state;
      const agent = state.agents[command.agentId];
      if (agent.activeTask?.id !== command.taskId || agent.activeTask.type !== "investigation" || agent.mode !== "interacting") return state;
      const memories = [...agent.memories];
      const returnGateId = agent.activeTask.viaGateId;
      while (memories.length < agent.memoryCapacity) memories.push(null);
      memories[command.slot] = command.memory;
      return bump(state, {
        agents: {
          ...state.agents,
          [command.agentId]: {
            ...agent,
            mode: "returning",
            activeTask: undefined,
            returnGateId,
            memories,
            fatigue: clampFatigue(agent.fatigue + command.fatigue),
          },
        },
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective: `${agent.name}带回了一条${command.memory.topic === "jump" ? "跳跃方法" : "新记忆"}`,
      });
    }
    case "FAIL_INVESTIGATION": {
      if (state.phase !== "explore") return state;
      const agent = state.agents[command.agentId];
      if (agent.activeTask?.id !== command.taskId || agent.activeTask.type !== "investigation" || agent.mode !== "interacting") return state;
      const memories = [...agent.memories];
      if (command.forgetMemoryId) {
        const memoryIndex = memories.findIndex((memory) => memory?.id === command.forgetMemoryId);
        if (memoryIndex >= 0) memories[memoryIndex] = null;
      }
      return bump(state, {
        agents: {
          ...state.agents,
          [command.agentId]: {
            ...agent,
            mode: "returning",
            activeTask: undefined,
            returnGateId: agent.activeTask.viaGateId,
            memories,
            fatigue: clampFatigue(agent.fatigue + command.fatigue),
          },
        },
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective: command.evidence.summary,
      });
    }
    case "COMPLETE_JUMP_TRAINING": {
      if (state.phase !== "explore") return state;
      const agent = state.agents[command.agentId];
      if (agent.activeTask?.id !== command.taskId || agent.activeTask.type !== "investigation" || agent.mode !== "interacting") return state;
      // Jump is a skill, never a memory: this transition ends the training
      // without ever writing to a memory slot.
      return bump(state, {
        agents: {
          ...state.agents,
          [command.agentId]: {
            ...agent,
            mode: "returning",
            activeTask: undefined,
            returnGateId: agent.activeTask.viaGateId,
            fatigue: clampFatigue(agent.fatigue + command.fatigue),
          },
        },
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective: command.evidence.summary,
      });
    }
    case "START_CLEANUP": {
      if (
        state.phase !== "explore" ||
        command.task.participantIds.length < 1 ||
        command.task.participantIds.length > 2 ||
        state.clearedObstacleIds.includes(command.task.obstacleId) ||
        command.task.participantIds.some((id) => state.agents[id].mode !== "following" || state.agents[id].fatigue >= 90)
      ) {
        return state;
      }
      const agents = { ...state.agents };
      command.task.participantIds.forEach((agentId) => {
        agents[agentId] = { ...agents[agentId], mode: "approaching", activeTask: command.task };
      });
      return bump(state, { agents, objective: "小队正在前往清理障碍" });
    }
    case "BEGIN_WORK":
      return updateTaskAgent(state, command.agentId, command.taskId, (agent) => ({ ...agent, mode: "working" }));
    case "COMPLETE_CLEANUP": {
      if (state.clearedObstacleIds.includes(command.obstacleId)) return state;
      const participants = command.agentIds.filter((id) => state.agents[id].activeTask?.id === command.taskId);
      if (participants.length !== command.agentIds.length) return state;
      const agents = { ...state.agents };
      participants.forEach((agentId) => {
        agents[agentId] = {
          ...agents[agentId],
          mode: "returning",
          activeTask: undefined,
          fatigue: clampFatigue(agents[agentId].fatigue + command.fatigue),
        };
      });
      return bump(state, {
        agents,
        inspiration: state.inspiration + command.inspiration,
        clearedObstacleIds: [...state.clearedObstacleIds, command.obstacleId],
        evidenceLog: [...state.evidenceLog, command.evidence],
        nearbyObstacleId: state.nearbyObstacleId === command.obstacleId ? undefined : state.nearbyObstacleId,
        objective: `清理完成，获得 ${command.inspiration} 点灵感`,
      });
    }
    case "LEARN_JUMP": {
      const agent = state.agents[command.agentId];
      if (agent.jumpKnowledge === command.knowledge) return state;
      return bump(state, {
        agents: {
          ...state.agents,
          [command.agentId]: { ...agent, jumpKnowledge: command.knowledge },
        },
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective: command.knowledge === "learned" ? `${agent.name}掌握了跳跃` : `${agent.name}还只理解了一部分跳跃方法`,
      });
    }
    case "TEACH_JUMP": {
      const teacher = state.agents[command.teacherId];
      const student = state.agents[command.studentId];
      if (
        teacher.jumpKnowledge !== "learned" ||
        student.jumpKnowledge === "learned" ||
        teacher.mode !== "following" ||
        student.mode !== "following"
      ) {
        return state;
      }
      return bump(state, {
        agents: {
          ...state.agents,
          [teacher.id]: { ...teacher, fatigue: clampFatigue(teacher.fatigue + 4) },
          [student.id]: { ...student, jumpKnowledge: "learned", fatigue: clampFatigue(student.fatigue + 4) },
        },
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective: `${teacher.name}把跳跃诀窍教给了${student.name}`,
      });
    }
    case "MARK_GATE_SCOUTED":
      return state.scoutedGateIds.includes(command.gateId)
        ? state
        : bump(state, { scoutedGateIds: [...state.scoutedGateIds, command.gateId] });
    case "UPGRADE_MEMORY": {
      const agent = state.agents[command.agentId];
      const cost = agent.memoryCapacity === 3 ? 2 : agent.memoryCapacity === 4 ? 4 : 0;
      if (cost === 0 || state.inspiration < cost) return state;
      const capacity = (agent.memoryCapacity + 1) as 4 | 5;
      return bump(state, {
        inspiration: state.inspiration - cost,
        agents: {
          ...state.agents,
          [agent.id]: { ...agent, memoryCapacity: capacity, memories: [...agent.memories, null] },
        },
        objective: `${agent.name}获得了第 ${capacity} 个记忆槽`,
      });
    }
    case "REST_SQUAD": {
      if (!state.atRestSpot) return state;
      const agents = { ...state.agents };
      (Object.keys(agents) as AgentId[]).forEach((id) => {
        agents[id] = {
          ...agents[id],
          mode: agents[id].mode === "tired" ? "following" : agents[id].mode,
          fatigue: Math.max(0, agents[id].fatigue - 35),
        };
      });
      return bump(state, { agents, objective: "小队在孵化静池休息了一会儿" });
    }
    case "ADD_FATIGUE": {
      if (command.amount <= 0) return state;
      const agents = { ...state.agents };
      let changed = false;
      command.agentIds.forEach((id) => {
        const agent = agents[id];
        const fatigue = clampFatigue(agent.fatigue + command.amount);
        if (fatigue === agent.fatigue) return;
        changed = true;
        agents[id] = {
          ...agent,
          fatigue,
          mode: fatigue >= 85 && agent.mode === "following" ? "tired" : agent.mode,
        };
      });
      return changed ? bump(state, { agents }) : state;
    }
    case "DECAY_MEMORIES": {
      if (command.amount <= 0) return state;
      const agents = { ...state.agents };
      let changed = false;
      (Object.keys(agents) as AgentId[]).forEach((id) => {
        const agent = agents[id];
        const memories = agent.memories.map((memory) => {
          if (!memory) return null;
          const strength = Math.max(0, memory.strength - command.amount * (memory.reinforced ? 0.4 : 1));
          changed = true;
          if (strength <= 0) return null;
          const fidelity = strength <= 35
            ? "fragmented" as const
            : strength <= 70 && memory.fidelity === "detailed"
              ? "compressed" as const
              : memory.fidelity;
          return {
            ...memory,
            strength,
            fidelity,
            confidence: strength <= 35 && memory.confidence === "believed" ? "questioned" as const : memory.confidence,
          };
        });
        if (changed) agents[id] = { ...agent, memories };
      });
      return changed ? bump(state, { agents }) : state;
    }
    case "STORE_MEMORY": {
      const agent = state.agents[command.agentId];
      const memories = [...agent.memories];
      while (memories.length < agent.memoryCapacity) memories.push(null);
      memories[command.slot] = command.memory;
      return updateAgent(state, command.agentId, (current) => ({ ...current, memories }));
    }
    case "SET_AGENT_UTTERANCE":
      return updateAgent(state, command.agentId, (agent) => ({ ...agent, utterance: command.utterance }));
    case "RECALL_AGENT": {
      const agent = state.agents[command.agentId];
      if (!agent.activeTask) {
        return agent.mode === "following" || agent.mode === "tired"
          ? updateAgent(state, command.agentId, (current) => ({ ...current, mode: "returning" }))
          : state;
      }
      if (agent.activeTask.type === "cleanup") {
        const agents = { ...state.agents };
        agent.activeTask.participantIds.forEach((id) => {
          if (agents[id].activeTask?.id === agent.activeTask?.id) agents[id] = { ...agents[id], mode: "returning", activeTask: undefined };
        });
        return bump(state, { agents, objective: "清理任务已取消，小队正在返回" });
      }
      return updateAgent(state, command.agentId, (current) => ({
        ...current,
        mode: "returning",
        returnGateId: current.activeTask?.type === "investigation" ? current.activeTask.viaGateId : undefined,
        activeTask: undefined,
      }));
    }
    case "FINISH_GATE_RETURN":
      return updateAgent(state, command.agentId, (agent) =>
        agent.mode === "returning" && agent.returnGateId === command.gateId
          ? { ...agent, returnGateId: undefined }
          : agent,
      );
    case "FINISH_RETURN":
      return updateAgent(state, command.agentId, (agent) =>
        agent.mode === "returning"
          ? { ...agent, mode: agent.fatigue >= 85 ? "tired" : "following", returnGateId: undefined }
          : agent,
      );
    case "START_DISCUSSION": {
      const [firstId, secondId] = command.discussion.agentIds;
      if (
        state.phase !== "explore" ||
        state.discussion ||
        firstId === secondId ||
        state.agents[firstId].mode !== "following" ||
        state.agents[secondId].mode !== "following"
      ) return state;
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
        nextAgents[agentId] = {
          ...nextAgents[agentId],
          mode: "following",
          fatigue: clampFatigue(nextAgents[agentId].fatigue + 4),
        };
      });
      command.updates.forEach((update) => {
        const agent = nextAgents[update.agentId];
        const memories = agent.memories.map((memory) =>
          memory?.id === update.memoryId ? ({ ...memory, confidence: update.confidence, reinforced: update.reinforced } satisfies Memory) : memory,
        );
        nextAgents[update.agentId] = { ...agent, memories };
      });
      return bump(state, {
        agents: nextAgents,
        discussion: undefined,
        evidenceLog: [...state.evidenceLog, command.evidence],
        objective: command.evidence.summary,
      });
    }
    case "CANCEL_AI_ACTIONS": {
      let changed = Boolean(state.discussion);
      const agents = { ...state.agents };
      (Object.keys(agents) as AgentId[]).forEach((agentId) => {
        const agent = agents[agentId];
        if (agent.mode === "discussing") {
          agents[agentId] = { ...agent, mode: "following" };
          changed = true;
          return;
        }
        if (agent.mode === "interacting" && agent.activeTask?.type === "investigation") {
          agents[agentId] = {
            ...agent,
            mode: "returning",
            returnGateId: agent.activeTask.viaGateId,
            activeTask: undefined,
          };
          changed = true;
        }
      });
      return changed
        ? bump(state, {
            agents,
            discussion: undefined,
            objective: "模型连接中断，当前对话没有生成记忆",
          })
        : state;
    }
    case "SET_OBJECTIVE":
      return state.objective === command.objective ? state : bump(state, { objective: command.objective });
    case "APPLY_GENERATED_CAST": {
      const agents = { ...state.agents };
      (Object.keys(command.cast.agents) as AgentId[]).forEach((agentId) => {
        const profile = command.cast.agents[agentId];
        agents[agentId] = {
          ...agents[agentId],
          name: profile.name,
          personality: profile.personality,
          communicationStyle: communicationStyleByPersonality[profile.personality],
          hiddenProfile: profile.hiddenProfile,
        };
      });
      return bump(state, { agents, generatedCast: command.cast, objective: "小队已经准备好，沿河寻找妈妈" });
    }
    case "REVEAL_CANDIDATE_FROGS":
      if (state.candidateFrogsRevealed || confirmedSourceCount(state) < 2) return state;
      return bump(state, {
        candidateFrogsRevealed: true,
        nearbyFrogId: undefined,
        objective: "线索终于拼出了方向，三位候选妈妈出现在水乡各处",
      });
    case "CHOOSE_MOTHER":
      if (state.phase === "ending" || !state.candidateFrogsRevealed) return state;
      return bump(state, {
        phase: "ending",
        ending: { selectedMotherId: command.frogId, correct: command.correct },
        objective: command.correct ? "你们找到了真正的妈妈" : "这只青蛙不是它们的妈妈",
      });
    case "DEMO_ENDING":
      return bump(state, {
        phase: "ending",
        candidateFrogsRevealed: true,
        nearbyFrogId: undefined,
        ending: { selectedMotherId: command.frogId, correct: command.correct },
        objective: command.correct ? "Demo：成功结算" : "Demo：失败结算",
      });
    case "RESET_GAME":
      return createInitialGameState(command.seed);
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
  return bump(state, { agents: { ...state.agents, [agentId]: next } });
}

function clampFatigue(value: number): number {
  return Math.min(MAX_FATIGUE, Math.max(0, Math.round(value)));
}

export function memoryUpgradeCost(capacity: 3 | 4 | 5): number {
  return capacity === 3 ? 2 : capacity === 4 ? 4 : 0;
}

export function confirmedSourceCount(state: Pick<GameState, "agents">): number {
  const sources = new Set<string>();
  Object.values(state.agents).forEach((agent) => {
    agent.memories.forEach((memory) => {
      if (
        memory?.confidence === "confirmed" &&
        memory.topic !== "jump" &&
        memory.transmission === "direct" &&
        memory.strength > 20
      ) sources.add(memory.sourceNpcId);
    });
  });
  return sources.size;
}

export function isObstacleCleared(state: Pick<GameState, "clearedObstacleIds">, obstacleId: ObstacleId): boolean {
  return state.clearedObstacleIds.includes(obstacleId);
}

function bump(state: GameState, update: Partial<GameState>): GameState {
  return { ...state, ...update, revision: state.revision + 1 };
}
