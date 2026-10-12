import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import type * as vscode from 'vscode';
import { CacheService } from '../src/services/cacheService';
import { DefinitionService } from '../src/services/definitionService';
import { LocalDataService } from '../src/services/localDataService';
import type { MdnClient } from '../src/services/mdnClient';

function createState(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) => (values.has(key) ? values.get(key) as T : fallback as T),
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    }
  };
}

async function createService(): Promise<DefinitionService> {
  const local = new LocalDataService();
  await local.load(resolve('resources/css-properties.json'));
  const client = {
    search: async (query: string) => [{
      title: `Search: ${query}`,
      summary: 'Generic MDN result',
      mdnUrl: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
      locale: 'zh-CN' as const,
      category: 'JavaScript'
    }],
    getSummary: async (property: { name: string }) => ({
      locale: 'zh-CN' as const,
      summary: `CSS: ${property.name}`,
      mdnUrl: `https://developer.mozilla.org/zh-CN/docs/Web/CSS/Reference/Properties/${property.name}`
    })
  } as unknown as MdnClient;
  const configuration = { get: <T>(_key: string, fallback: T) => fallback } as vscode.WorkspaceConfiguration;
  return new DefinitionService(local, new CacheService(createState()), client, () => configuration);
}

test('uses global MDN search for ambiguous terms outside CSS context', async () => {
  const service = await createService();
  const result = await service.lookup('filter', { preferCss: false });
  assert.equal(result.documents?.[0].category, 'JavaScript');
  assert.equal(result.definition, undefined);
});

test('uses structured property data for the same term in CSS context', async () => {
  const service = await createService();
  const result = await service.lookup('filter', { preferCss: true });
  assert.equal(result.definition?.name, 'filter');
  assert.equal(result.definition?.summary, 'CSS: filter');
});
