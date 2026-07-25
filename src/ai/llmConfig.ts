export type LlmMode = "default" | "custom";

export type LlmConfig = Readonly<{
  mode: LlmMode;
  baseUrl: string;
  model: string;
  apiKey: string;
}>;

const STORAGE_KEY = "who-is-mom.llm-config";

const defaults: LlmConfig = {
  mode: "default",
  baseUrl: "",
  model: "",
  apiKey: "",
};

export interface LlmConfigStore {
  get(): LlmConfig;
  set(next: Partial<LlmConfig>): LlmConfig;
  reset(): LlmConfig;
  subscribe(listener: (config: LlmConfig) => void): () => void;
}

export function createLlmConfigStore(): LlmConfigStore {
  let config = readConfig();
  const listeners = new Set<(config: LlmConfig) => void>();

  function commit(next: LlmConfig): LlmConfig {
    config = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Private browsing or blocked storage should not prevent the game from starting.
    }
    listeners.forEach((listener) => listener(config));
    return config;
  }

  return {
    get: () => config,
    set: (next) => commit({ ...config, ...next }),
    reset: () => commit(defaults),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function readConfig(): LlmConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<LlmConfig> & { endpoint?: unknown; enabled?: unknown };
    const hasLegacyCustomConfig = parsed.enabled === true && Boolean(parsed.model) && Boolean(parsed.apiKey);
    const mode = parsed.mode === "custom" || hasLegacyCustomConfig ? "custom" : "default";
    return {
      mode,
      baseUrl: stringValue(parsed.baseUrl ?? parsed.endpoint),
      model: stringValue(parsed.model),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : defaults.apiKey,
    };
  } catch {
    return defaults;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
