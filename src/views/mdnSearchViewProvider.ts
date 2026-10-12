import * as vscode from 'vscode';
import { CacheService } from '../services/cacheService';
import { DefinitionService } from '../services/definitionService';
import type { MdnDocumentResult, MdnPageDetail, SearchResult } from '../types/propertyDefinition';

type ViewState =
  | { kind: 'empty'; history: string[] }
  | { kind: 'loading'; query: string; history: string[] }
  | { kind: 'result'; result: SearchResult; history: string[] }
  | { kind: 'notFound'; result: SearchResult; history: string[] }
  | { kind: 'detail'; detail: MdnPageDetail; query: string; history: string[]; error?: string };

interface WebviewMessage {
  type: 'ready' | 'search' | 'refresh' | 'openExternal' | 'selectHistory' | 'showDetail' | 'backToResults';
  query?: string;
  url?: string;
  document?: MdnDocumentResult;
}

export class MdnSearchViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'mdnSearch.view';

  private view?: vscode.WebviewView;
  private state: ViewState;
  private currentQuery?: string;
  private currentPreferCss = false;
  private currentDocument?: MdnDocumentResult;
  private resultState?: Extract<ViewState, { kind: 'result' }>;
  private activeRequest?: AbortController;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly definitions: DefinitionService,
    private readonly cache: CacheService,
    private readonly getConfiguration: () => vscode.WorkspaceConfiguration
  ) {
    this.state = { kind: 'empty', history: cache.getHistory() };
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message));
  }

  async search(query: string, refresh = false, preferCss = false): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;
    this.currentQuery = trimmed;
    this.currentPreferCss = preferCss;
    this.activeRequest?.abort();
    const request = new AbortController();
    this.activeRequest = request;
    this.setState({ kind: 'loading', query: trimmed, history: this.cache.getHistory() });

    try {
      const result = await this.definitions.lookup(trimmed, { refresh, signal: request.signal, preferCss });
      if (request.signal.aborted) return;
      let history = this.cache.getHistory();
      if (result.definition || result.documents?.length) {
        const limit = this.getConfiguration().get<number>('historyLimit', 10);
        history = await this.cache.addHistory(result.definition?.name ?? result.query, limit);
      }
      const state: ViewState = {
        kind: result.definition || result.documents?.length ? 'result' : 'notFound',
        result,
        history
      };
      if (state.kind === 'result') this.resultState = state;
      this.currentDocument = undefined;
      this.setState(state);
    } catch (error) {
      if (request.signal.aborted) return;
      const result: SearchResult = {
        query: trimmed,
        suggestions: this.definitions.suggest(trimmed),
        error: error instanceof Error ? error.message : String(error)
      };
      this.setState({ kind: 'notFound', result, history: this.cache.getHistory() });
    } finally {
      if (this.activeRequest === request) this.activeRequest = undefined;
    }
  }

  async refresh(): Promise<void> {
    if (this.currentDocument) {
      await this.showDetail(this.currentDocument, true);
      return;
    }
    if (this.currentQuery) await this.search(this.currentQuery, true, this.currentPreferCss);
  }

  focusSearch(): void {
    void this.view?.webview.postMessage({ type: 'focusSearch' });
  }

  async clearHistory(): Promise<void> {
    await this.cache.clearHistory();
    this.state = { ...this.state, history: [] };
    this.publishState();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.publishState();
        break;
      case 'search':
      case 'selectHistory':
        if (message.query) await this.search(message.query);
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'openExternal':
        if (message.url) await this.openMdnUrl(message.url);
        break;
      case 'showDetail':
        if (message.document) await this.showDetail(message.document);
        break;
      case 'backToResults':
        if (this.resultState) {
          this.currentDocument = undefined;
          this.setState({ ...this.resultState, history: this.cache.getHistory() });
        }
        break;
    }
  }

  private async showDetail(document: MdnDocumentResult, refresh = false): Promise<void> {
    this.currentDocument = document;
    this.activeRequest?.abort();
    const request = new AbortController();
    this.activeRequest = request;
    this.setState({ kind: 'loading', query: document.title, history: this.cache.getHistory() });

    try {
      const detail = await this.definitions.getPageDetail(document, { refresh, signal: request.signal });
      if (request.signal.aborted) return;
      this.setState({
        kind: 'detail',
        detail,
        query: this.currentQuery ?? document.title,
        history: this.cache.getHistory()
      });
    } catch (error) {
      if (request.signal.aborted) return;
      this.setState({
        kind: 'detail',
        detail: { ...document, sections: [] },
        query: this.currentQuery ?? document.title,
        history: this.cache.getHistory(),
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      if (this.activeRequest === request) this.activeRequest = undefined;
    }
  }

  private async openMdnUrl(value: string): Promise<void> {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && url.hostname === 'developer.mozilla.org') {
        await vscode.env.openExternal(vscode.Uri.parse(url.toString()));
      }
    } catch {
      // Ignore malformed or untrusted links from the webview.
    }
  }

  private setState(state: ViewState): void {
    this.state = state;
    this.publishState();
  }

  private publishState(): void {
    void this.view?.webview.postMessage({ type: 'state', state: this.state });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css'));
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>MDN Search</title>
</head>
<body>
  <form id="search-form" class="search-bar">
    <label class="sr-only" for="search-input">CSS 属性</label>
    <input id="search-input" name="query" type="search" placeholder="CSS 属性" autocomplete="off" spellcheck="false">
    <button type="submit">查询</button>
  </form>
  <main id="content" aria-live="polite"></main>
  <section id="history-section" class="history" hidden>
    <h2>最近查询</h2>
    <div id="history-list" class="history-list"></div>
  </section>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function createNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}
