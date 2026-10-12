import type * as vscode from 'vscode';
import type { MdnDocumentResult, MdnPageDetail, PropertyDefinition, SearchResult } from '../types/propertyDefinition';
import { normalizePropertyCandidate } from './propertyResolver';
import { LocalDataService } from './localDataService';
import { CacheService } from './cacheService';
import { MdnClient } from './mdnClient';

export interface LookupOptions {
  refresh?: boolean;
  signal?: AbortSignal;
  preferCss?: boolean;
}

export class DefinitionService {
  constructor(
    private readonly localData: LocalDataService,
    private readonly cache: CacheService,
    private readonly client: MdnClient,
    private readonly getConfiguration: () => vscode.WorkspaceConfiguration
  ) {}

  has(name: string): boolean {
    return this.localData.has(name);
  }

  async lookup(input: string, options: LookupOptions = {}): Promise<SearchResult> {
    const propertyQuery = normalizePropertyCandidate(input);
    const query = propertyQuery ?? input.trim();
    const local = options.preferCss && propertyQuery ? this.localData.get(propertyQuery) : undefined;
    if (!local) {
      return this.searchMdn(query, options);
    }

    const configuration = this.getConfiguration();
    const preferred = configuration.get<'zh-CN' | 'en-US'>('locale', 'zh-CN');
    const fallback = configuration.get<'zh-CN' | 'en-US'>('fallbackLocale', 'en-US');
    const cacheHours = configuration.get<number>('cacheHours', 24);
    const locales = preferred === fallback ? [preferred] : [preferred, fallback];

    if (!options.refresh) {
      for (const locale of locales) {
        const cached = this.cache.get(local.name, locale, cacheHours);
        if (cached) return { query, definition: cached, suggestions: [] };
      }
    }

    let lastError: string | undefined;
    for (const locale of locales) {
      try {
        const summary = await this.client.getSummary(local, locale, options.signal);
        if (summary) {
          const definition: PropertyDefinition = {
            ...local,
            locale: summary.locale,
            summary: summary.summary,
            mdnUrl: summary.mdnUrl,
            source: 'network'
          };
          await this.cache.set(definition);
          return { query, definition, suggestions: [] };
        }
      } catch (error) {
        if (options.signal?.aborted) throw error;
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    const definition: PropertyDefinition = {
      ...local,
      locale: preferred,
      source: 'local'
    };
    return { query, definition, suggestions: [], error: lastError };
  }

  suggest(query: string): string[] {
    return this.localData.suggest(query);
  }

  async getPageDetail(
    document: MdnDocumentResult,
    options: { refresh?: boolean; signal?: AbortSignal } = {}
  ): Promise<MdnPageDetail> {
    const cacheHours = this.getConfiguration().get<number>('cacheHours', 24);
    if (!options.refresh) {
      const cached = this.cache.getPage(document.mdnUrl, cacheHours);
      if (cached) return cached;
    }
    const detail = await this.client.getPageDetail(document, options.signal);
    await this.cache.setPage(detail);
    return detail;
  }

  private async searchMdn(query: string, options: LookupOptions): Promise<SearchResult> {
    const configuration = this.getConfiguration();
    const preferred = configuration.get<'zh-CN' | 'en-US'>('locale', 'zh-CN');
    const fallback = configuration.get<'zh-CN' | 'en-US'>('fallbackLocale', 'en-US');
    const locales = preferred === fallback ? [preferred] : [preferred, fallback];
    let lastError: string | undefined;

    for (const locale of locales) {
      try {
        const documents = await this.client.search(query, locale, options.signal);
        if (documents.length > 0) {
          return { query, documents, suggestions: [] };
        }
      } catch (error) {
        if (options.signal?.aborted) throw error;
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      query,
      documents: [],
      suggestions: this.localData.suggest(query.toLowerCase()),
      error: lastError
    };
  }
}
