export interface KeyValueStore {
  read(key: string): string | undefined;
  write(key: string, value: string): boolean;
  remove(key: string): void;
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

  remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      return;
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

  remove(key: string): void {
    this.values.delete(key);
  }
}
