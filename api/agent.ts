import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { AgentRequest } from "../src/ai/contracts";
import { validateAgentRequest, validateAgentResult } from "../src/ai/contracts";

type ChatCompletion = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
};

class ModelProxyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ModelProxyError";
  }
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const mode = headerValue(request.headers["x-llm-mode"]) === "custom" ? "custom" : "default";
  const baseUrl = mode === "custom"
    ? headerValue(request.headers["x-model-base-url"])
    : process.env.MODEL_BASE_URL ?? "https://api.siliconflow.cn/v1";
  const apiKey = mode === "custom"
    ? headerValue(request.headers["x-model-api-key"])
    : process.env.MODEL_API_KEY;
  const model = mode === "custom"
    ? headerValue(request.headers["x-model-name"])
    : process.env.MODEL_NAME ?? "zai-org/GLM-5.2";
  if (mode === "custom" && (!baseUrl || !isAllowedModelUrl(baseUrl))) {
    response.status(400).json({ error: "Custom model base URL must be an HTTPS URL" });
    return;
  }
  if (!baseUrl || !apiKey || !model) {
    response.status(503).json({ error: "Model service is not configured" });
    return;
  }

  const config = { baseUrl, apiKey, model };
  if (request.method === "GET") {
    try {
      await checkModel(config);
      response.status(200).json({ status: "ready" });
    } catch (error) {
      console.error("Agent health check failed", error instanceof Error ? error.message : "unknown error");
      response.status(502).json({ error: "Model health check failed", detail: modelErrorDetail(error) });
    }
    return;
  }

  const rawBody = request.body as unknown;
  const body = validateAgentRequest(rawBody);
  if (!body || JSON.stringify(rawBody).length > 24_000) {
    response.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const payload = await callModel(body, config);
    const content = payload.choices?.[0]?.message?.content;
    if (payload.choices?.[0]?.finish_reason === "length") {
      throw new ModelProxyError("模型输出被截断，请提高角色生成输出额度后重试");
    }
    if (!content) throw new Error("Empty model response");
    const parsed = JSON.parse(extractJsonObject(content)) as unknown;
    const result = validateAgentResult(body, normalizeModelResult(body, parsed));
    if (!result) throw new Error("Invalid model response");

    response.status(200).json({
      requestId: body.requestId,
      source: "model",
      result,
    });
  } catch (error) {
    console.error("Agent proxy request failed", error instanceof Error ? error.message : "unknown error");
    response.status(502).json({
      error: "Model request failed",
      detail: modelErrorDetail(error),
    });
  }
}

async function checkModel(config: { baseUrl: string; apiKey: string; model: string }): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstream = await fetch(resolveChatCompletionsEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with OK." }],
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new ModelProxyError(upstreamErrorMessage(upstream.status), upstream.status);
    const payload = (await upstream.json()) as ChatCompletion;
    if (!payload.choices?.[0]?.message?.content) throw new Error("Empty model response");
  } finally {
    clearTimeout(timeout);
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return typeof result === "string" && result.trim() ? result.trim() : undefined;
}

function isAllowedModelUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function callModel(
  request: AgentRequest,
  config: { baseUrl: string; apiKey: string; model: string },
): Promise<ChatCompletion> {
  const controller = new AbortController();
  const configuredTimeoutMs = Number.parseInt(process.env.MODEL_TIMEOUT_MS ?? "55000", 10);
  const timeoutMs = Number.isFinite(configuredTimeoutMs) ? Math.max(90_000, configuredTimeoutMs) : 90_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = resolveChatCompletionsEndpoint(config.baseUrl);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: taskTemperature(request.task),
        max_tokens: taskMaxTokens(request.task),
        messages: [
          {
            role: "system",
            content: systemPrompt(request.task),
          },
          {
            role: "user",
            content: JSON.stringify(request),
          },
        ],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new ModelProxyError(upstreamErrorMessage(upstream.status), upstream.status);
    return (await upstream.json()) as ChatCompletion;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveChatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

export function normalizeModelResult(request: AgentRequest, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized: Record<string, unknown> = { ...(value as Record<string, unknown>), task: request.task };

  if (request.task === "encode_memory") {
    const rawTone = typeof normalized.tone === "string" ? normalized.tone.toLowerCase() : "";
    normalized.tone = rawTone === "afraid" || rawTone === "fearful"
      ? "afraid"
      : rawTone === "excited" || rawTone === "happy"
        ? "excited"
        : "calm";

    const rawFidelity = typeof normalized.fidelity === "string" ? normalized.fidelity.toLowerCase() : "";
    let fidelity = rawFidelity === "fragmented" || rawFidelity === "low"
      ? "fragmented"
      : rawFidelity === "compressed" || rawFidelity === "medium"
        ? "compressed"
        : "detailed";
    if (request.agent.fatigue >= 70) fidelity = "fragmented";
    else if (request.agent.fatigue >= 45 && fidelity === "detailed") fidelity = "compressed";
    normalized.fidelity = fidelity;

    if (normalized.suggestedSlot !== 0 && normalized.suggestedSlot !== 1 && normalized.suggestedSlot !== 2) {
      const emptySlot = request.memories.slice(0, 3).findIndex((memory) => memory === null);
      normalized.suggestedSlot = emptySlot >= 0 ? emptySlot : 0;
    }

    const rawOmissions = normalized.omittedFields;
    const omissions = Array.isArray(rawOmissions)
      ? rawOmissions.filter((field: unknown) => field === "time" || field === "place" || field === "source")
      : [];
    normalized.omittedFields = request.agent.fatigue >= 70
      ? ["time", "place", "source"]
      : omissions.length > 0 ? omissions : ["time"];
  }

  if (request.task === "reconcile_memories") {
    const validOutcome = normalized.outcome === "reinforce" || normalized.outcome === "question" || normalized.outcome === "revise";
    if (!validOutcome) {
      normalized.outcome = Array.isArray(normalized.questionedMemoryIds) && normalized.questionedMemoryIds.length > 0
        ? "question"
        : "reinforce";
    }
  }

  if (request.task === "judge_jump_learning") {
    if (normalized.outcome !== "partial" && normalized.outcome !== "learned") {
      normalized.outcome = request.agent.personality === "cautious" ? "partial" : "learned";
    }
    if (!Array.isArray(normalized.relevantMemoryIds)) normalized.relevantMemoryIds = [];
  }

  return normalized;
}

function upstreamErrorMessage(status: number): string {
  if (status === 401 || status === 403) return "API Key 无效或没有调用该模型的权限";
  if (status === 404) return "接口地址或模型名称不存在";
  if (status === 429) return "模型服务请求过多或账户额度不足";
  return `上游模型返回 ${status}`;
}

function modelErrorDetail(error: unknown): string {
  if (error instanceof ModelProxyError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "模型响应超时，请稍后重试";
  return "模型没有返回有效的结构化结果";
}

function taskTemperature(task: AgentRequest["task"]): number {
  if (task === "generate_cast") return 0.8;
  if (task === "encode_memory") return 0.68;
  if (task === "reconcile_memories") return 0.52;
  return 0.4;
}

function taskMaxTokens(task: AgentRequest["task"]): number {
  if (task === "generate_cast") return 1_100;
  if (task === "encode_memory" || task === "reconcile_memories") return 240;
  return 180;
}

function systemPrompt(task: AgentRequest["task"]): string {
  if (task === "encode_memory") {
    return "You turn one hidden NPC conversation into one tadpole memory. Return one JSON object only. Use exactly {\"task\":\"encode_memory\",\"selectedFactIds\":[\"allowed-fact-id\"],\"omittedFields\":[\"time\"],\"suggestedSlot\":0,\"tone\":\"calm\",\"fidelity\":\"detailed\",\"spokenSummary\":\"简短第一人称中文记忆\",\"afterthought\":\"稍后自然说出的一句中文\"}. Use exactly one provided fact ID and never invent or combine facts. The NPC is the witness or source; appearance and location facts describe the observed frog, never the NPC. The agent.hiddenProfile and speechRules are private character instructions: make wording, certainty, attention and omissions consistently express them without quoting or revealing the profile. Continue naturally from conversationHistory; do not repeat an earlier summary verbatim. seenFactIds and turnIndex describe earlier encounters. Always omit at least one of time, place, or source. Never output frog species or taxonomy. Respect fatigue: 0-44 may be detailed, 45-69 compressed, 70+ fragmented and must omit time/place/source. spokenSummary must be concise, characterful Chinese and contain only the selected clue. afterthought is optional, must match the same voice, and must not add facts.";
  }
  if (task === "judge_jump_learning") {
    return "You judge whether a tadpole learned jumping from trainingSummary, trainingSourceNpcId, personality and its private hiddenProfile. Jumping is a skill and never a memory, so memories may be empty. Return exactly {\"task\":\"judge_jump_learning\",\"outcome\":\"learned\",\"relevantMemoryIds\":[],\"spokenSummary\":\"简短中文\"}. outcome MUST be partial or learned. relevantMemoryIds may contain only provided memory IDs. Keep the spokenSummary in the character's private voice without revealing the profile.";
  }
  if (task === "decide_movement_intent") {
    return "You choose one short-term tadpole movement intent. Return one JSON object only. Choose behavior from stay_close, scout_ahead, wander, orbit_companion, inspect_target, lag_behind, avoid_target, return_to_player. Use only visibleTargetIds for targetId. durationMs must be between 1000 and 20000. Required fields: task, behavior, durationMs, distance, energy. spokenLine is optional concise Chinese.";
  }
  if (task === "generate_cast") {
    return "You generate a new game cast from a numeric seed. Return one JSON object only. Keep every provided ID and include each once. Each agent requires id, personality, introduction, hiddenProfile:{dossier,speechRules}, and its fixed name: modian is 墨点, xiaolang is 小浪, paopao is 泡泡. Assign cautious, impulsive, social exactly once. dossier is a private 30-80 Chinese character psychological description covering motivation, insecurity, trust and attention. speechRules is a private 20-60 character rule for rhythm, certainty, questions and conflict. Make all three genuinely distinct; never reveal dossier or speechRules in introduction. Each frog requires only id and a neutral Chinese name; do not return appearance features because the local simulation owns them. Frog names must not reveal colors, eyes, markings, headwear, red objects, feet or leg shape. Never output species or taxonomy. Required top-level fields: task, agents, frogs.";
  }
  return "You reconcile two tadpoles' existing memories. Return exactly {\"task\":\"reconcile_memories\",\"outcome\":\"reinforce\",\"acceptedMemoryIds\":[\"provided-memory-id\"],\"questionedMemoryIds\":[],\"spokenSummary\":\"简短中文\"}. outcome must be reinforce, question, or revise and IDs may only be provided memory IDs. Use both private hiddenProfiles to make the discussion voice and conflict response distinctive. Continue from discussionHistory and do not repeat its wording. Never reveal the private profiles.";
}

function extractJsonObject(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in response");
  return content.slice(start, end + 1);
}
