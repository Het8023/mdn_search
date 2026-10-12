import { readFile } from 'node:fs/promises';
import type { CssPropertyRecord } from '../types/propertyDefinition';

interface CssPropertyIndex {
  version: number;
  properties: CssPropertyRecord[];
}

export class LocalDataService {
  private readonly properties = new Map<string, CssPropertyRecord>();

  async load(filePath: string): Promise<void> {
    const contents = await readFile(filePath, 'utf8');
    const index = JSON.parse(contents) as CssPropertyIndex;
    for (const property of index.properties) {
      this.properties.set(property.name.toLowerCase(), property);
    }
  }

  get(name: string): CssPropertyRecord | undefined {
    return this.properties.get(name.toLowerCase());
  }

  has(name: string): boolean {
    return this.properties.has(name.toLowerCase());
  }

  suggest(query: string, limit = 6): string[] {
    const normalized = query.toLowerCase();
    return [...this.properties.keys()]
      .map((name) => ({ name, score: suggestionScore(normalized, name) }))
      .filter((entry) => entry.score < Number.POSITIVE_INFINITY)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((entry) => entry.name);
  }
}

export function suggestionScore(query: string, candidate: string): number {
  if (!query) return Number.POSITIVE_INFINITY;
  if (candidate === query) return 0;
  if (candidate.startsWith(query)) return 1 + (candidate.length - query.length) / 100;
  if (candidate.includes(query)) return 3 + candidate.indexOf(query) / 100;
  const distance = levenshtein(query, candidate);
  const threshold = Math.max(2, Math.floor(query.length * 0.35));
  return distance <= threshold ? 10 + distance : Number.POSITIVE_INFINITY;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}
