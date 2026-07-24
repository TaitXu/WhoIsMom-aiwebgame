import type {
  AgentRequest,
  AgentResponse,
  EncodeMemoryRequest,
  ReconcileMemoriesRequest,
} from "./contracts";

export interface AgentAdapter {
  run(request: AgentRequest): Promise<AgentResponse>;
}

export interface AgentService {
  encodeMemory(request: EncodeMemoryRequest): Promise<AgentResponse>;
  reconcileMemories(request: ReconcileMemoriesRequest): Promise<AgentResponse>;
}

export function createAgentService(
  remote: AgentAdapter,
  fallback: AgentAdapter,
): AgentService {
  async function run(request: AgentRequest): Promise<AgentResponse> {
    try {
      return await remote.run(request);
    } catch (error) {
      console.warn("Agent request failed; using local fallback.", error);
      return fallback.run(request);
    }
  }

  return {
    encodeMemory: run,
    reconcileMemories: run,
  };
}
