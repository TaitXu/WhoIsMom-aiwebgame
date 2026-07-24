import type { AgentAdapter } from "./agentService";
import type { AgentRequest, AgentResponse, AgentResult } from "./contracts";

export function createLocalAgentFallback(): AgentAdapter {
  return {
    async run(request: AgentRequest): Promise<AgentResponse> {
      return {
        requestId: request.requestId,
        source: "fallback",
        result: fallbackResult(request),
      };
    },
  };
}

function fallbackResult(request: AgentRequest): AgentResult {
  if (request.task === "encode_memory") {
    const fact = request.allowedFacts[0]!;
    const personality = request.agent.personality;
    const omittedFields = personality === "impulsive" ? (["time", "place"] as const) : [];
    return {
      task: "encode_memory",
      selectedFactIds: [fact.id],
      omittedFields: [...omittedFields],
      suggestedSlot: 0,
      tone: personality === "impulsive" ? "excited" : personality === "cautious" ? "calm" : "calm",
      spokenSummary: summarizeFact(fact, personality),
    };
  }

  const contextualMemories = request.memories.filter((memory) => hasPlaceContext(memory.summary));
  const contextlessTravelMemories = request.memories.filter(
    (memory) => memory.sourceNpcId === "dragonfly" && !hasPlaceContext(memory.summary),
  );
  if (contextualMemories.length > 0 && contextlessTravelMemories.length > 0) {
    return {
      task: "reconcile_memories",
      outcome: "revise",
      acceptedMemoryIds: contextualMemories.map((memory) => memory.id),
      questionedMemoryIds: contextlessTravelMemories.map((memory) => memory.id),
      spokenSummary: "墨点记住了远方雨林这个地点，小浪的外貌线索不能直接指向本地妈妈。",
    };
  }

  const travelMemories = request.memories.filter((memory) => memory.sourceNpcId === "dragonfly");
  const localMemories = request.memories.filter((memory) => memory.sourceNpcId !== "dragonfly");
  if (travelMemories.length > 0 && localMemories.length > 0) {
    return {
      task: "reconcile_memories",
      outcome: "question",
      acceptedMemoryIds: localMemories.map((memory) => memory.id),
      questionedMemoryIds: travelMemories.map((memory) => memory.id),
      spokenSummary: "等等，蜻蜓说的是远方旅行见闻，不能直接当成本地线索。",
    };
  }

  const [first, second] = request.memories;
  return {
    task: "reconcile_memories",
    outcome: first && second ? "reinforce" : "question",
    acceptedMemoryIds: request.memories.map((memory) => memory.id),
    questionedMemoryIds: [],
    spokenSummary: first && second ? "我们的记忆能互相印证，这条线索更可靠了。" : "只有一条记忆，还需要再找证据。",
  };
}

function summarizeFact(fact: MemoryFact, personality: "cautious" | "impulsive" | "social"): string {
  if (personality === "impulsive") return `我记得它说：${fact.value}！`;
  if (personality === "social") {
    return `我和它聊到：${fact.value}${fact.place ? `，是在${fact.place}` : ""}。`;
  }
  const context = [fact.time, fact.place, fact.source].filter(Boolean).join("，");
  return `我记得很清楚：${fact.value}${context ? `（${context}）` : ""}。`;
}

type MemoryFact = Readonly<{
  value: string;
  time?: string;
  place?: string;
  source?: string;
}>;

function hasPlaceContext(summary: string): boolean {
  return ["雨林", "远方", "本地", "芦苇湾"].some((keyword) => summary.includes(keyword));
}
