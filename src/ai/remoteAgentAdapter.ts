import type { AgentAdapter } from "./agentService";
import type { AgentRequest, AgentResponse } from "./contracts";
import { validateAgentResult } from "./contracts";

export function createRemoteAgentAdapter(
  endpoint = "/api/agent",
  timeoutMs = 8_000,
): AgentAdapter {
  const cache = new Map<string, AgentResponse>();

  return {
    async run(request: AgentRequest): Promise<AgentResponse> {
      const key = JSON.stringify(request);
      const cached = cache.get(key);
      if (cached) return cached;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
