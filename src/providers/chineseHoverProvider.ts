import * as vscode from 'vscode';
import type { PropertyDefinition } from '../types/propertyDefinition';
import { DefinitionService } from '../services/definitionService';
import { extractPropertyFromLine, findPropertyRange } from '../services/propertyResolver';

export class ChineseHoverProvider implements vscode.HoverProvider {
  constructor(private readonly definitions: DefinitionService) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const line = document.lineAt(position.line).text;
    const name = extractPropertyFromLine(line, position.character);
    if (!name || !this.definitions.has(name)) {
      return undefined;
    }

    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    try {
      const result = await this.definitions.lookup(name, { signal: controller.signal, preferCss: true });
      if (!result.definition || token.isCancellationRequested) {
        return undefined;
      }
      const wordRange = findPropertyRange(line, position.character);
      const range = wordRange
        ? new vscode.Range(position.line, wordRange.start, position.line, wordRange.end)
        : undefined;
      return new vscode.Hover(buildHoverMarkdown(result.definition), range);
    } catch {
      return undefined;
    } finally {
      cancellation.dispose();
    }
  }
}

export function buildHoverMarkdown(definition: PropertyDefinition): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = false;
  markdown.supportHtml = false;
  markdown.appendMarkdown(`**\`${escapeMarkdown(definition.name)}\`**\n\n`);

  if (definition.summary) {
    markdown.appendText(definition.summary);
    if (definition.locale === 'en-US') {
      markdown.appendMarkdown('\n\n_中文内容暂缺，当前显示英文定义。_');
    }
  } else {
    markdown.appendText('在线定义暂不可用，以下信息来自本地 MDN 数据。');
  }

  if (definition.status.deprecated) {
    markdown.appendMarkdown('\n\n**状态：** 已废弃');
  } else if (definition.status.experimental) {
    markdown.appendMarkdown('\n\n**状态：** 实验性');
  } else if (definition.status.standard_track) {
    markdown.appendMarkdown('\n\n**状态：** 标准属性');
  }

  if (definition.syntax) {
    markdown.appendMarkdown('\n\n**语法**\n\n');
    markdown.appendCodeblock(definition.syntax, 'css');
  }

  const compatibility = formatCompatibility(definition);
  if (compatibility) {
    markdown.appendMarkdown(`\n\n**兼容性：** ${escapeMarkdown(compatibility)}`);
  }

  markdown.appendMarkdown(`\n\n[在 MDN 中查看完整文档](${definition.mdnUrl})`);
  markdown.appendMarkdown('\n\n_内容来源：MDN Web Docs / Mozilla Contributors_');
  return markdown;
}

export function formatCompatibility(definition: PropertyDefinition): string {
  return definition.compatibility
    .map((entry) => `${entry.browser} ${entry.version === true ? '支持' : `${entry.version}+`}`)
    .join(' · ');
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>-]/g, '\\$&');
}
