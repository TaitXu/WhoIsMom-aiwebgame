import type { AgentAdapter } from "./agentService";
import type { AgentRequest, AgentResponse, AgentResult } from "./contracts";
import { fallbackFrogFeatures, fallbackFrogNames } from "../game/case/frogFeatures";

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
  if (request.task === "generate_cast") {
    return {
      task: "generate_cast",
      agents: [
        { id: "modian", name: "墨点", personality: "cautious", introduction: "我会把每个细节都记下来。" },
        { id: "xiaolang", name: "小浪", personality: "impulsive", introduction: "我先去前面看看！" },
        { id: "paopao", name: "泡泡", personality: "social", introduction: "大家一起游，不要走散。" },
      ],
      frogs: request.frogIds.map((id) => ({
        id,
        name: fallbackFrogNames[id],
        features: fallbackFrogFeatures[id],
      })),
    };
  }
  if (request.task === "decide_movement_intent") {
    const behavior = request.agent.personality === "impulsive"
      ? "scout_ahead"
      : request.agent.personality === "social"
        ? "orbit_companion"
        : "stay_close";
    return {
      task: "decide_movement_intent",
      behavior,
      durationMs: 5_500,
      distance: request.agent.personality === "cautious" ? "near" : "medium",
      energy: request.agent.personality === "impulsive" ? "excited" : "calm",
      spokenLine: request.agent.personality === "impulsive"
        ? "前面好像有新鲜事，我去看看！"
        : request.agent.personality === "social"
          ? "大家还记得刚才听到什么吗？"
          : "先别急，我想把细节记牢。",
    };
  }
  if (request.task === "encode_memory") {
    const fact = request.allowedFacts.find(
      (candidate) => candidate.veracity === "contextual" || candidate.veracity === "false",
    ) ?? request.allowedFacts[0]!;
    const personality = request.agent.personality;
    const tired = request.agent.fatigue >= 70;
    const compressed = request.agent.fatigue >= 45 || request.agent.communicationStyle !== "literal";
    const omittedFields = tired
      ? (["time", "place", "source"] as const)
      : compressed
        ? (["time", "place"] as const)
        : (["source"] as const);
    return {
      task: "encode_memory",
      selectedFactIds: [fact.id],
      omittedFields: [...omittedFields],
      suggestedSlot: 0,
      tone: personality === "impulsive" ? "excited" : personality === "cautious" ? "calm" : "calm",
      fidelity: tired ? "fragmented" : compressed ? "compressed" : "detailed",
      spokenSummary: summarizeFact(fact, personality, request.agent.communicationStyle, request.agent.fatigue, omittedFields),
    };
  }

  if (request.task === "judge_jump_learning") {
    const jumpMemories = request.memories.filter((memory) => memory.topic === "jump");
    const learned = request.agent.personality !== "cautious" || jumpMemories.some((memory) => memory.reinforced);
    return {
      task: "judge_jump_learning",
      outcome: learned ? "learned" : "partial",
      relevantMemoryIds: jumpMemories.map((memory) => memory.id),
      spokenSummary: learned
        ? "我懂了，要等荷叶回弹的时候朝叶心跳。"
        : "我记住步骤了，但还是不太敢真的跳过去。",
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

function summarizeFact(
  fact: MemoryFact,
  personality: "cautious" | "impulsive" | "social",
  communicationStyle: "literal" | "embellishing" | "agreeable",
  fatigue: number,
  omittedFields: readonly ("time" | "place" | "source")[],
): string {
  if (fatigue >= 70) return `我太累了……只记得“${fact.value.slice(0, 18)}……”`;
  if (communicationStyle === "embellishing") return `我敢肯定！${fact.value}！`;
  if (personality === "social") {
    const place = !omittedFields.includes("place") && fatigue < 45 ? fact.place : undefined;
    return `我和它聊到：${fact.value}${place ? `，好像是在${place}` : ""}。`;
  }
  const context = [
    omittedFields.includes("time") ? undefined : fact.time,
    omittedFields.includes("place") ? undefined : fact.place,
    omittedFields.includes("source") ? undefined : fact.source,
  ].filter(Boolean).join("，");
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
