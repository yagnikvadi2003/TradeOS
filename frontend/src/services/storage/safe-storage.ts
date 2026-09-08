/**
 * Storage wrapper that tolerates private-mode browsers and quota errors.
 * Only non-sensitive UI preferences are ever stored here.
 */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function resolve(backend: () => Storage | undefined): KeyValueStorage {
  return {
    get(key) {
      try {
        return backend()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        backend()?.setItem(key, value);
      } catch {
        /* quota exceeded or storage disabled — preference is simply not persisted */
      }
    },
    remove(key) {
      try {
        backend()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const localPreferences: KeyValueStorage = resolve(() =>
  typeof window === 'undefined' ? undefined : window.localStorage,
);
