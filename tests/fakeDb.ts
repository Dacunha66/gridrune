// In-memory stand-in for the platform card database, with the same admin-only write rule.
import type { CollectionRef, Db, DocSnap } from '../src/game/cardStore';

type Store = Map<string, Record<string, unknown>>;

export function fakeDb(opts: { admin: boolean } = { admin: true }) {
  const stores = new Map<string, Store>();
  const storeFor = (path: string): Store => {
    if (!stores.has(path)) stores.set(path, new Map());
    return stores.get(path)!;
  };
  const denied = () => Promise.reject({ code: 'invalid_argument', message: 'write below minimum level' });

  const makeCollection = (store: Store): CollectionRef => {
    const listeners = new Set<() => void>();
    const snap = (id: string): DocSnap => ({ id, exists: store.has(id), data: () => (store.has(id) ? structuredClone(store.get(id)) : undefined) });
    const notify = () => listeners.forEach((l) => l());
    return {
      doc: (id = Math.random().toString(36).slice(2)) => ({
        get: async () => snap(id),
        set: async (data) => {
          if (!opts.admin) return denied();
          store.set(id, structuredClone(data));
          notify();
        },
        delete: async () => {
          if (!opts.admin) return denied();
          store.delete(id);
          notify();
        },
      }),
      get: async () => ({ docs: [...store.keys()].sort().map(snap) }),
      onSnapshot: (next) => {
        const l = () => next({ docs: [...store.keys()].sort().map(snap) });
        listeners.add(l);
        l();
        return () => listeners.delete(l);
      },
    };
  };

  const collections = new Map<string, CollectionRef>();
  const db: Db = {
    collection: (path) => {
      if (!collections.has(path)) collections.set(path, makeCollection(storeFor(path)));
      return collections.get(path)!;
    },
  };
  return { db, store: storeFor('cards'), storeFor };
}
