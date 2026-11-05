import { useState } from 'react';

/** Increments each time `open` flips to true, so forms keyed by it start fresh on every opening. */
export function useSession(open: boolean): number {
  const [state, setState] = useState({ open: false, n: 0 });
  if (open !== state.open) setState({ open, n: open ? state.n + 1 : state.n });
  return state.n;
}
