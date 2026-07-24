import type { AgentState, Memory, Personality } from "../../core/types";

export function chooseMemorySlot(
  agent: Pick<AgentState, "memories" | "personality">,
): 0 | 1 | 2 {
  const emptyIndex = agent.memories.findIndex((memory) => memory === null);
  if (emptyIndex >= 0) return emptyIndex as 0 | 1 | 2;

  return chooseReplacement(agent.personality, agent.memories as Memory[]);
}

function chooseReplacement(
  personality: Personality,
  memories: Memory[],
): 0 | 1 | 2 {
  if (personality === "social") {
    const unreinforced = memories.findIndex((memory) => !memory.reinforced);
    if (unreinforced >= 0) return unreinforced as 0 | 1 | 2;
  }

  if (personality === "impulsive") {
    return indexOfOldest(memories);
  }

  const candidates = memories
    .map((memory, index) => ({ memory, index }))
    .filter(({ memory }) => !memory.reinforced);
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.memory.createdAt - b.memory.createdAt);
    return candidates[0]!.index as 0 | 1 | 2;
  }

  return indexOfOldest(memories);
}

function indexOfOldest(memories: Memory[]): 0 | 1 | 2 {
  let oldestIndex = 0;
  for (let index = 1; index < memories.length; index += 1) {
    if (memories[index]!.createdAt < memories[oldestIndex]!.createdAt) {
      oldestIndex = index;
    }
  }
  return oldestIndex as 0 | 1 | 2;
}
