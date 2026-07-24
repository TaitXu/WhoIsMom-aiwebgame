import type { GameCommand, GameState } from "../../core/types";
import { reduceGameState } from "./gameRules";

export type StateListener = (state: Readonly<GameState>) => void;

export interface GameStore {
  getState(): Readonly<GameState>;
  dispatch(command: GameCommand): void;
  subscribe(listener: StateListener): () => void;
}

export function createGameStore(initialState: GameState): GameStore {
  let state = initialState;
  const listeners = new Set<StateListener>();

  return {
    getState: () => state,
    dispatch(command) {
      const next = reduceGameState(state, command);
      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
