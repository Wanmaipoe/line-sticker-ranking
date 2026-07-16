'use client';

import { useState, useEffect, useCallback } from 'react';

// Owner assignments live in localStorage, per browser, on purpose: the same packs come back every
// month, so next month's upload auto-fills. Keeping it out of the DB means the server never learns
// who earns what, and costs zero Turso writes.
const STORAGE_KEY = 'lsr-revenue-owners-v1';

interface Stored {
  /** Owner names, in the order they were added — drives the dropdown. */
  owners: string[];
  /** itemId -> owner name. */
  map: Record<string, string>;
}

const EMPTY: Stored = { owners: [], map: {} };

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    // Tolerate a hand-edited or half-written blob rather than throwing on every render.
    return {
      owners: Array.isArray(p?.owners) ? p.owners.filter((o: unknown) => typeof o === 'string') : [],
      map: p?.map && typeof p.map === 'object' ? p.map : {},
    };
  } catch {
    return EMPTY;
  }
}

export function useOwnerMap() {
  const [state, setState] = useState<Stored>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Intentional client-only read: localStorage doesn't exist during SSR, so hydrating from it
    // in the render body would mismatch. Same "load after mount" pattern as useFavorites/AdsToggle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(read());
    setLoaded(true);
  }, []);

  const persist = useCallback((next: Stored) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode / quota — assignments still work for this session */
    }
  }, []);

  /** Assign (or clear, with null) an item's owner. Adds unseen names to the roster. */
  const assign = useCallback(
    (itemId: string, owner: string | null) => {
      setState((prev) => {
        const map = { ...prev.map };
        let owners = prev.owners;
        const name = owner?.trim();
        if (name) {
          map[itemId] = name;
          if (!owners.includes(name)) owners = [...owners, name];
        } else delete map[itemId];

        const next = { owners, map };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    []
  );

  /** Assign many at once (the "apply to all unassigned" shortcut). */
  const assignMany = useCallback((itemIds: string[], owner: string) => {
    const name = owner.trim();
    if (!name) return;
    setState((prev) => {
      const map = { ...prev.map };
      for (const id of itemIds) map[id] = name;
      const owners = prev.owners.includes(name) ? prev.owners : [...prev.owners, name];
      const next = { owners, map };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const addOwner = useCallback((name: string) => {
    const n = name.trim();
    if (!n) return;
    setState((prev) => {
      if (prev.owners.includes(n)) return prev;
      const next = { ...prev, owners: [...prev.owners, n] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  /** Drop an owner from the roster and unassign everything they held. */
  const removeOwner = useCallback((name: string) => {
    setState((prev) => {
      const map: Record<string, string> = {};
      for (const [id, o] of Object.entries(prev.map)) if (o !== name) map[id] = o;
      const next = { owners: prev.owners.filter((o) => o !== name), map };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearAll = useCallback(() => persist(EMPTY), [persist]);

  const ownerOf = useCallback((itemId: string) => state.map[itemId] ?? null, [state.map]);

  return {
    owners: state.owners,
    map: state.map,
    loaded,
    ownerOf,
    assign,
    assignMany,
    addOwner,
    removeOwner,
    clearAll,
  };
}
