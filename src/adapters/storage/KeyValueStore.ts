export interface KeyValueStore {
  read(key: string): string | undefined;
  write(key: string, value: string): boolean;
}

export class LocalStorageStore implements KeyValueStore {
  constructor(private readonly storage: Storage) {}

  read(key: string): string | undefined {
    try {
      return this.storage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  write(key: string, value: string): boolean {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();

  read(key: string): string | undefined {
    return this.values.get(key);
  }

  write(key: string, value: string): boolean {
    this.values.set(key, value);
    return true;
  }
}
