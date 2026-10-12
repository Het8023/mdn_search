import type * as vscode from 'vscode';
import type { MdnPageDetail, PropertyDefinition } from '../types/propertyDefinition';

interface CacheRecord {
  savedAt: number;
  definition: PropertyDefinition;
}

const CACHE_KEY = 'mdnSearch.definitionCache.v1';
const HISTORY_KEY = 'mdnSearch.history.v1';
const PAGE_CACHE_KEY = 'mdnSearch.pageCache.v1';

export class CacheService {
  constructor(private readonly state: vscode.Memento) {}

  get(name: string, locale: string, maxAgeHours: number): PropertyDefinition | undefined {
    if (maxAgeHours <= 0) return undefined;
    const cache = this.state.get<Record<string, CacheRecord>>(CACHE_KEY, {});
    const record = cache[this.key(name, locale)];
    if (!record || Date.now() - record.savedAt > maxAgeHours * 60 * 60 * 1000) {
      return undefined;
    }
    return { ...record.definition, source: 'cache' };
  }

  async set(definition: PropertyDefinition): Promise<void> {
    if (!definition.summary) return;
    const cache = this.state.get<Record<string, CacheRecord>>(CACHE_KEY, {});
    cache[this.key(definition.name, definition.locale)] = {
      savedAt: Date.now(),
      definition: { ...definition, source: 'network' }
    };
    const entries = Object.entries(cache)
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, 250);
    await this.state.update(CACHE_KEY, Object.fromEntries(entries));
  }

  getHistory(): string[] {
    return this.state.get<string[]>(HISTORY_KEY, []);
  }

  async addHistory(name: string, limit: number): Promise<string[]> {
    const history = [name, ...this.getHistory().filter((item) => item !== name)].slice(0, Math.max(0, limit));
    await this.state.update(HISTORY_KEY, history);
    return history;
  }

  async clearHistory(): Promise<void> {
    await this.state.update(HISTORY_KEY, []);
  }

  getPage(url: string, maxAgeHours: number): MdnPageDetail | undefined {
    if (maxAgeHours <= 0) return undefined;
    const cache = this.state.get<Record<string, { savedAt: number; detail: MdnPageDetail }>>(PAGE_CACHE_KEY, {});
    const record = cache[url];
    if (!record || Date.now() - record.savedAt > maxAgeHours * 60 * 60 * 1000) {
      return undefined;
    }
    return record.detail;
  }

  async setPage(detail: MdnPageDetail): Promise<void> {
    const cache = this.state.get<Record<string, { savedAt: number; detail: MdnPageDetail }>>(PAGE_CACHE_KEY, {});
    cache[detail.mdnUrl] = { savedAt: Date.now(), detail };
    const entries = Object.entries(cache)
      .sort(([, left], [, right]) => right.savedAt - left.savedAt)
      .slice(0, 60);
    await this.state.update(PAGE_CACHE_KEY, Object.fromEntries(entries));
  }

  private key(name: string, locale: string): string {
    return `${locale.toLowerCase()}:${name.toLowerCase()}`;
  }
}
