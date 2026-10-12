import * as vscode from 'vscode';
import { CacheService } from './services/cacheService';
import { DefinitionService } from './services/definitionService';
import { LocalDataService } from './services/localDataService';
import { MdnClient } from './services/mdnClient';
import {
  extractPropertyFromLine,
  extractSearchTokenFromLine,
  normalizeSearchQuery
} from './services/propertyResolver';
import { ChineseHoverProvider } from './providers/chineseHoverProvider';
import { MdnSearchViewProvider } from './views/mdnSearchViewProvider';

const SUPPORTED_LANGUAGES = ['css', 'scss', 'less', 'postcss', 'html', 'vue', 'svelte'];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const localData = new LocalDataService();
  const dataPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'css-properties.json').fsPath;
  try {
    await localData.load(dataPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MDN Search 无法加载 CSS 属性数据：${detail}`);
    return;
  }

  const configuration = () => vscode.workspace.getConfiguration('mdnSearch');
  const cache = new CacheService(context.globalState);
  const definitions = new DefinitionService(localData, cache, new MdnClient(), configuration);
  const viewProvider = new MdnSearchViewProvider(context.extensionUri, definitions, cache, configuration);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MdnSearchViewProvider.viewType, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.languages.registerHoverProvider(
      SUPPORTED_LANGUAGES.map((language) => ({ language })),
      new ChineseHoverProvider(definitions)
    ),
    vscode.commands.registerCommand('mdnSearch.searchSelectedProperty', async () => {
      const selection = await getQueryFromEditor();
      if (!selection) return;
      await showView();
      await viewProvider.search(selection.query, false, selection.preferCss);
    }),
    vscode.commands.registerCommand('mdnSearch.focusSearch', async () => {
      await showView();
      viewProvider.focusSearch();
    }),
    vscode.commands.registerCommand('mdnSearch.refresh', () => viewProvider.refresh()),
    vscode.commands.registerCommand('mdnSearch.clearHistory', () => viewProvider.clearHistory()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mdnSearch')) void viewProvider.refresh();
    })
  );
}

export function deactivate(): void {}

interface EditorQuery {
  query: string;
  preferCss: boolean;
}

async function getQueryFromEditor(): Promise<EditorQuery | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    if (!editor.selection.isEmpty) {
      const selected = normalizeSearchQuery(editor.document.getText(editor.selection));
      if (selected) {
        return {
          query: selected,
          preferCss: ['css', 'scss', 'less', 'postcss'].includes(editor.document.languageId)
        };
      }
    }
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line).text;
    const atCursor = extractPropertyFromLine(line, position.character);
    if (atCursor) return { query: atCursor, preferCss: true };
    const tokenAtCursor = extractSearchTokenFromLine(line, position.character);
    if (tokenAtCursor) return { query: tokenAtCursor, preferCss: false };
  }

  const input = await vscode.window.showInputBox({
    title: '查询 MDN',
    prompt: '输入 CSS、JavaScript、Web API、HTML 或其他 Web 技术关键词',
    placeHolder: '例如 Array.prototype.map',
    validateInput: (value) => normalizeSearchQuery(value) ? undefined : '请输入 1 到 200 个字符的查询内容'
  });
  return input ? { query: input, preferCss: false } : undefined;
}

async function showView(): Promise<void> {
  try {
    await vscode.commands.executeCommand('workbench.view.extension.mdnSearch');
  } catch {
    // The view-specific focus command below also reveals its container.
  }
  await vscode.commands.executeCommand(`${MdnSearchViewProvider.viewType}.focus`);
}
