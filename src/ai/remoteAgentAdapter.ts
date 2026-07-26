import type { AgentAdapter } from "./agentService";
import type { AgentRequest, AgentResponse } from "./contracts";
import { validateAgentResult } from "./contracts";
import type { LlmConfigStore } from "./llmConfig";

export function createRemoteAgentAdapter(
  endpoint = "/api/agent",
  timeoutMs = 22_000,
  configStore?: LlmConfigStore,
): AgentAdapter {
  const cache = new Map<string, AgentResponse>();

  return {
    async check(): Promise<void> {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), Math.min(timeoutMs, 30_000));
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: modelHeaders(configStore?.get()),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await readErrorPayload(response);
          throw new Error(payload.detail ?? payload.error ?? `模型代理返回 ${response.status}`);
        }
      } finally {
        window.clearTimeout(timeout);
      }
    },
    async run(request: AgentRequest): Promise<AgentResponse> {
      const config = configStore?.get();
      const key = JSON.stringify({
        request,
        mode: config?.mode ?? "default",
        baseUrl: config?.mode === "custom" ? config.baseUrl : undefined,
        model: config?.mode === "custom" ? config.model : undefined,
      });
      const cached = cache.get(key);
      if (cached) return cached;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        const requestEndpoint = endpoint;
        const headers = modelHeaders(config);
        headers["Content-Type"] = "application/json";
        const response = await fetch(requestEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await readErrorPayload(response);
          throw new Error(payload.detail ?? payload.error ?? `模型代理返回 ${response.status}`);
        }

        const payload = (await response.json()) as Partial<AgentResponse>;
        const result = validateAgentResult(request, payload.result);
        if (!result || payload.requestId !== request.requestId) {
          throw new Error("Agent API returned an invalid payload");
        }

        const validated: AgentResponse = {
          requestId: request.requestId,
          source: payload.source === "model" ? "model" : "fallback",
          result,
        };
        cache.set(key, validated);
        return validated;
      } finally {
        window.clearTimeout(timeout);
      }
    },
  };
}

function modelHeaders(config: ReturnType<LlmConfigStore["get"]> | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config?.mode === "custom") {
    headers["x-llm-mode"] = "custom";
    if (config.baseUrl) headers["x-model-base-url"] = config.baseUrl;
    if (config.model) headers["x-model-name"] = config.model;
    if (config.apiKey) headers["x-model-api-key"] = config.apiKey;
  } else {
    headers["x-llm-mode"] = "default";
  }
  return headers;
}

async function readErrorPayload(response: Response): Promise<{ error?: string; detail?: string }> {
  try {
    return (await response.json()) as { error?: string; detail?: string };
  } catch {
    return {};
  }
}
