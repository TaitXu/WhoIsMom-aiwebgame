import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { AgentRequest } from "../src/ai/contracts";
import { validateAgentRequest, validateAgentResult } from "../src/ai/contracts";

type ChatCompletion = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawBody = request.body as unknown;
  const body = validateAgentRequest(rawBody);
  if (!body || JSON.stringify(rawBody).length > 24_000) {
    response.status(400).json({ error: "Invalid request" });
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

  try {
    const payload = await callModel(body, { baseUrl, apiKey, model });
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty model response");
    const parsed = JSON.parse(extractJsonObject(content)) as unknown;
    const result = validateAgentResult(body, parsed);
    if (!result) throw new Error("Invalid model response");

    response.status(200).json({
      requestId: body.requestId,
      source: "model",
      result,
    });
  } catch (error) {
    console.error("Agent proxy request failed", error instanceof Error ? error.message : "unknown error");
    response.status(502).json({ error: "Model request failed" });
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
  const timeoutMs = Number.parseInt(process.env.MODEL_TIMEOUT_MS ?? "20000", 10);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 20000);
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.35,
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
    if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`);
    return (await upstream.json()) as ChatCompletion;
  } finally {
    clearTimeout(timeout);
  }
}

function systemPrompt(task: AgentRequest["task"]): string {
  if (task === "encode_memory") {
    return "You encode exactly one limited memory from a hidden NPC conversation. Return one JSON object only. selectedFactIds MUST contain exactly one ID, never combine facts or extract multiple key clues. Use only provided fact IDs and never invent facts. If any provided fact has veracity contextual or false, choose one of those ambiguous facts rather than a true fact. Always omit at least one of time, place, or source so the clue cannot be complete. Never output a frog species, taxonomy, or breed name; forbidden examples include 树蛙, 牛蛙, 泽蛙, 雨蛙, 角蛙, 蛙科, 品种. Respect fatigue: 0-44 may be detailed, 45-69 compressed, 70+ fragmented and must omit time/place/source. Respect communicationStyle: literal preserves caveats, embellishing sounds overconfident without inventing, agreeable sounds suggestible. Required fields: task, selectedFactIds, omittedFields, suggestedSlot, tone, fidelity, spokenSummary. spokenSummary must be concise Chinese, ambiguous, and mention only the one selected clue.";
  }
  if (task === "judge_jump_learning") {
    return "You judge whether a tadpole learned jumping from its actual memories and personality. Return one JSON object only. Use only provided memory IDs. Non-cautious personalities must return learned; cautious may return partial or learned. Required fields: task, outcome, relevantMemoryIds, spokenSummary. spokenSummary must be concise Chinese.";
  }
  if (task === "decide_movement_intent") {
    return "You choose one short-term tadpole movement intent. Return one JSON object only. Choose behavior from stay_close, scout_ahead, wander, orbit_companion, inspect_target, lag_behind, avoid_target, return_to_player. Use only visibleTargetIds for targetId. durationMs must be between 1000 and 20000. Required fields: task, behavior, durationMs, distance, energy. spokenLine is optional concise Chinese.";
  }
  if (task === "generate_cast") {
    return "You generate a tightly constrained game cast. Return one JSON object only. Keep every provided ID exactly and include every requested entry once. The agents array requires id, name, personality, introduction; use cautious, impulsive, social exactly once each. The frogs array requires id, name, features. Every features object must contain exactly bodyTone, bellyTone, eyeTone, markingPattern, headAdornment, redAdornment, hindLegShape and use only values from featureVocabulary. Obey requiredFeatures exactly. All three frogs share one base silhouette; make their full feature vectors unique, use a different redAdornment for each, and vary at least five of the seven dimensions across the cast. Each decoy must share 3 to 5 exact feature values with motherId, so no candidate is obviously correct or unrelated. Frog names must be neutral Chinese nature nicknames and must not reveal colors, eyes, markings, headwear, red objects, feet, or leg shape. Never output species, taxonomy, or breed terms such as 树蛙, 牛蛙, 泽蛙, 雨蛙, 角蛙, 蛙科, 品种. All text must be concise Chinese. Top-level required fields: task, agents, frogs.";
  }
  return "You reconcile two tadpoles' existing memories. Return one JSON object only. Use only provided memory IDs. Required fields: task, outcome, acceptedMemoryIds, questionedMemoryIds, spokenSummary. spokenSummary must be concise Chinese.";
}

function extractJsonObject(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in response");
  return content.slice(start, end + 1);
}
