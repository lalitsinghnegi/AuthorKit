import { useCallback, useState } from "react";

type History<T> = { past: T[]; present: T; future: T[] };

const LIMIT = 100;

/** Undo/redo over immutable values. `commit` records a step; `reset` clears history. */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<History<T>>({ past: [], present: initial, future: [] });

  const commit = useCallback(
    (next: T) =>
      setState((s) =>
        next === s.present
          ? s
          : { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] },
      ),
    [],
  );
  const undo = useCallback(
    () =>
      setState((s) =>
        s.past.length === 0
          ? s
          : {
              past: s.past.slice(0, -1),
              present: s.past[s.past.length - 1],
              future: [s.present, ...s.future],
            },
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setState((s) =>
        s.future.length === 0
          ? s
          : { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) },
      ),
    [],
  );
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return {
    value: state.present,
    commit,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
