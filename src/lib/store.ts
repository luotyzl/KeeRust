import { useSyncExternalStore } from "react";

// A minimal external store (the React analog of the Vue reactive singleton):
// plain mutable state + a subscriber set. Components subscribe to slices via the
// returned `use` hook. No dependencies — built on React's useSyncExternalStore.
export interface Store<T> {
  getState: () => T;
  setState: (partial: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: (listener: () => void) => () => void;
  use: <U>(selector: (s: T) => U) => U;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState: Store<T>["setState"] = (partial) => {
    const next =
      typeof partial === "function"
        ? (partial as (s: T) => Partial<T>)(state)
        : partial;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  // Selectors must return primitives or stable references (raw state slices);
  // derive collections in components with useMemo to avoid render loops.
  function use<U>(selector: (s: T) => U): U {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state)
    );
  }

  return { getState, setState, subscribe, use };
}
