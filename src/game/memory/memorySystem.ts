import type { AgentState, Memory, Personality } from "../../core/types";

export function chooseMemorySlot(
  agent: Pick<AgentState, "memories" | "personality" | "memoryCapacity">,
): number {
  const visibleMemories = agent.memories.slice(0, agent.memoryCapacity);
  const emptyIndex = visibleMemories.findIndex((memory) => memory === null);
  if (emptyIndex >= 0) return emptyIndex;

  return chooseReplacement(agent.personality, visibleMemories as Memory[]);
}

function chooseReplacement(personality: Personality, memories: Memory[]): number {
  if (personality === "social") {
    const unreinforced = memories.findIndex((memory) => !memory.reinforced);
    if (unreinforced >= 0) return unreinforced;
  }

  if (personality === "impulsive") return indexOfOldest(memories);

  const candidates = memories
    .map((memory, index) => ({ memory, index }))
    .filter(({ memory }) => !memory.reinforced)
    .sort((a, b) => a.memory.createdAt - b.memory.createdAt);
  return candidates[0]?.index ?? indexOfOldest(memories);
}

function indexOfOldest(memories: Memory[]): number {
  let oldestIndex = 0;
  for (let index = 1; index < memories.length; index += 1) {
    if (memories[index]!.createdAt < memories[oldestIndex]!.createdAt) oldestIndex = index;
  }
  return oldestIndex;
}
