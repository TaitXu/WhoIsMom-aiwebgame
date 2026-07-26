import type {
  AgentRequest,
  AgentResponse,
  EncodeMemoryRequest,
  GenerateCastRequest,
  JudgeJumpLearningRequest,
  MovementDecisionRequest,
  ReconcileMemoriesRequest,
} from "./contracts";

export interface AgentAdapter {
  run(request: AgentRequest): Promise<AgentResponse>;
  check?(): Promise<void>;
}

export interface AgentService {
  encodeMemory(request: EncodeMemoryRequest): Promise<AgentResponse>;
  reconcileMemories(request: ReconcileMemoriesRequest): Promise<AgentResponse>;
  judgeJumpLearning(request: JudgeJumpLearningRequest): Promise<AgentResponse>;
  decideMovementIntent(request: MovementDecisionRequest): Promise<AgentResponse>;
  generateCast(request: GenerateCastRequest): Promise<AgentResponse>;
}

export type AgentServiceStatus = "unknown" | "ready" | "unavailable";

export class ModelUnavailableError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ModelUnavailableError";
    this.cause = cause;
  }
}

export interface ManagedAgentService extends AgentService {
  checkAvailability(): Promise<void>;
  getStatus(): AgentServiceStatus;
  subscribe(listener: (status: AgentServiceStatus, error?: ModelUnavailableError) => void): () => void;
}

export function createAgentService(
  remote: AgentAdapter,
): ManagedAgentService {
  let status: AgentServiceStatus = "unknown";
  const listeners = new Set<(status: AgentServiceStatus, error?: ModelUnavailableError) => void>();

  function setStatus(next: AgentServiceStatus, error?: ModelUnavailableError): void {
    status = next;
    listeners.forEach((listener) => listener(status, error));
  }

  async function run(request: AgentRequest): Promise<AgentResponse> {
    try {
      const response = await remote.run(request);
      if (response.source !== "model") {
        throw new ModelUnavailableError("大模型没有返回有效结果，游戏不会使用本地记忆代替。请检查模型配置后重试。");
      }
      setStatus("ready");
      return response;
    } catch (error) {
      const unavailable = error instanceof ModelUnavailableError
        ? error
        : new ModelUnavailableError(
            `无法连接大模型：${error instanceof Error ? error.message : "未知错误"}。游戏不会生成本地替代记忆。`,
            error,
          );
      console.error("Agent request failed; pausing model-dependent gameplay.", error);
      setStatus("unavailable", unavailable);
      throw unavailable;
    }
  }

  async function checkAvailability(): Promise<void> {
    try {
      if (!remote.check) throw new Error("模型适配器不支持连接检查");
      await remote.check();
      setStatus("ready");
    } catch (error) {
      const unavailable = new ModelUnavailableError(
        `无法连接大模型：${error instanceof Error ? error.message : "未知错误"}。游戏不会生成本地替代记忆。`,
        error,
      );
      setStatus("unavailable", unavailable);
      throw unavailable;
    }
  }

  return {
    encodeMemory: run,
    reconcileMemories: run,
    judgeJumpLearning: run,
    decideMovementIntent: run,
    generateCast: run,
    checkAvailability,
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
