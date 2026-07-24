import type { AgentId, FrogId, NpcId } from "../core/types";
import type { CharacterView } from "./characterView";

export type ViewRegistry = {
  player: CharacterView;
  agents: Record<AgentId, CharacterView>;
  npcs: Record<NpcId, CharacterView>;
  frogs: Record<FrogId, CharacterView>;
};
