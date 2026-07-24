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

  const baseUrl = process.env.MODEL_BASE_URL;
  const apiKey = process.env.MODEL_API_KEY;
  const model = process.env.MODEL_NAME;
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

async function callModel(
  request: AgentRequest,
  config: { baseUrl: string; apiKey: string; model: string },
): Promise<ChatCompletion> {
  const controller = new AbortController();
  const timeoutMs = Number.parseInt(process.env.MODEL_TIMEOUT_MS ?? "8000", 10);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 8000);
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
    return "You encode a tadpole's limited memory. Return one JSON object only. Use only provided fact IDs. Personality may omit context but may not invent facts. Required fields: task, selectedFactIds, omittedFields, suggestedSlot, tone, spokenSummary. spokenSummary must be concise Chinese.";
  }
  return "You reconcile two tadpoles' existing memories. Return one JSON object only. Use only provided memory IDs. Required fields: task, outcome, acceptedMemoryIds, questionedMemoryIds, spokenSummary. spokenSummary must be concise Chinese.";
}

function extractJsonObject(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in response");
  return content.slice(start, end + 1);
}
