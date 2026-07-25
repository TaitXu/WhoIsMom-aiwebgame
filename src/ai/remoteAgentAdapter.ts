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
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (config?.mode === "custom") {
          headers["x-llm-mode"] = "custom";
          if (config.baseUrl) headers["x-model-base-url"] = config.baseUrl;
          if (config.model) headers["x-model-name"] = config.model;
          if (config.apiKey) headers["x-model-api-key"] = config.apiKey;
        } else {
          headers["x-llm-mode"] = "default";
        }
        const response = await fetch(requestEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Agent API returned ${response.status}`);

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
