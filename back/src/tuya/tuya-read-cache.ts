interface CachedRead {
  value: any;
  fetchedAt: number;
}

/** Shared by all sessions of a Tuya project; callers never receive mutable cache objects. */
export class TuyaReadCache {
  private readonly entries = new Map<string, CachedRead>();
  private readonly versions = new Map<string, number>();
  private readonly pending = new Map<string, { version: number; promise: Promise<any> }>();

  async read<T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && Date.now() - cached.fetchedAt < maxAgeMs) {
      return structuredClone(cached.value);
    }
    const version = this.versions.get(key) ?? 0;
    const pending = this.pending.get(key);
    if (pending?.version === version) return structuredClone(await pending.promise);

    const promise = Promise.resolve()
      .then(load)
      .then(async (value) => {
        // A read started before a command must not resurrect its old state.
        if (version !== (this.versions.get(key) ?? 0)) return this.read(key, maxAgeMs, load);
        this.entries.set(key, { value: structuredClone(value), fetchedAt: Date.now() });
        return value;
      });
    this.pending.set(key, { version, promise });
    try {
      return structuredClone(await promise);
    } finally {
      if (this.pending.get(key)?.promise === promise) this.pending.delete(key);
    }
  }

  update<T>(key: string, update: (value: T) => T) {
    const cached = this.entries.get(key);
    if (cached) cached.value = update(structuredClone(cached.value));
  }

  invalidate(prefix: string) {
    const keys = new Set([...this.entries.keys(), ...this.pending.keys()]);
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      this.entries.delete(key);
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    }
  }
}
