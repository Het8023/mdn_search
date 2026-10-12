import { parse, type HTMLElement, type Node as HtmlNode } from 'node-html-parser';
import type {
  CssPropertyRecord,
  MdnContentBlock,
  MdnContentSection,
  MdnDocumentResult,
  MdnPageDetail
} from '../types/propertyDefinition';

interface MdnSearchDocument {
  mdn_url: string;
  title: string;
  locale: string;
  summary?: string;
}

interface MdnSearchResponse {
  documents?: MdnSearchDocument[];
}

export interface MdnSummary {
  locale: 'zh-CN' | 'en-US';
  summary: string;
  mdnUrl: string;
}

export class MdnClient {
  async search(
    query: string,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
    limit = 12
  ): Promise<MdnDocumentResult[]> {
    const documents = await this.requestSearch(query, locale, signal);
    return documents
      .filter((document) => document.summary)
      .slice(0, limit)
      .map((document) => ({
        title: toPlainText(document.title),
        summary: toPlainText(document.summary ?? ''),
        mdnUrl: new URL(document.mdn_url, 'https://developer.mozilla.org').toString(),
        locale,
        category: categoryFromMdnUrl(document.mdn_url)
      }));
  }

  async getSummary(
    property: CssPropertyRecord,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal
  ): Promise<MdnSummary | undefined> {
    const documents = await this.requestSearch(property.name, locale, signal);
    const document = selectPropertyDocument(documents, property.name);
    if (!document?.summary) {
      return undefined;
    }
    return {
      locale,
      summary: toPlainText(document.summary),
      mdnUrl: new URL(document.mdn_url, 'https://developer.mozilla.org').toString()
    };
  }

  async getPageDetail(document: MdnDocumentResult, signal?: AbortSignal): Promise<MdnPageDetail> {
    const url = new URL(document.mdnUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'developer.mozilla.org') {
      throw new Error('不允许加载非 MDN 页面');
    }
    const response = await fetchWithTimeout(url, signal, 8000);
    if (!response.ok) {
      throw new Error(`MDN 页面请求失败：HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      throw new Error('MDN 页面返回了不支持的内容类型');
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 2_500_000) {
      throw new Error('MDN 页面超出大小限制');
    }
    const html = await response.text();
    if (html.length > 2_500_000) {
      throw new Error('MDN 页面超出大小限制');
    }
    return parseMdnPageHtml(html, document);
  }

  private async requestSearch(
    query: string,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal
  ): Promise<MdnSearchDocument[]> {
    const url = new URL('https://developer.mozilla.org/api/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('locale', locale);

    const response = await fetchWithTimeout(url, signal, 5000);
    if (!response.ok) {
      throw new Error(`MDN 请求失败：HTTP ${response.status}`);
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 1_000_000) {
      throw new Error('MDN 响应超出大小限制');
    }
    const text = await response.text();
    if (text.length > 1_000_000) {
      throw new Error('MDN 响应超出大小限制');
    }
    const data = JSON.parse(text) as MdnSearchResponse;
    return data.documents ?? [];
  }
}

const EXCLUDED_SECTIONS = new Set([
  '本文内容',
  '尝试一下',
  '浏览器兼容性',
  '参见',
  '帮助改进 mdn',
  'in this article',
  'try it',
  'browser compatibility',
  'see also',
  'help improve mdn'
]);

export function parseMdnPageHtml(html: string, document: MdnDocumentResult): MdnPageDetail {
  const root = parse(html);
  const main = root.querySelector('main#content');
  if (!main) {
    throw new Error('无法识别 MDN 页面内容');
  }

  for (const element of main.querySelectorAll('script, style, svg, button, nav, aside')) {
    element.remove();
  }

  const baselineElement = main.querySelector('.baseline-indicator, [class*="baseline"]');
  const baseline = baselineElement ? limitText(cleanText(baselineElement.innerText), 300) : undefined;
  const sections: MdnContentSection[] = [];

  for (const heading of main.querySelectorAll('h2')) {
    const title = cleanText(heading.innerText);
    if (!title || EXCLUDED_SECTIONS.has(title.toLowerCase())) continue;
    const blocks = extractSectionBlocks(heading);
    if (blocks.length > 0) {
      sections.push({ title, blocks });
    }
    if (sections.length >= 8) break;
  }

  return {
    ...document,
    baseline: baseline || undefined,
    sections
  };
}

function extractSectionBlocks(heading: HTMLElement): MdnContentBlock[] {
  const parent = heading.parentNode as HTMLElement;
  let nodes: HtmlNode[] = [];

  if (parent.rawTagName === 'section' && parent.querySelectorAll('h2').length === 1) {
    const headingIndex = parent.childNodes.indexOf(heading);
    nodes = parent.childNodes.slice(headingIndex + 1);
  } else {
    const headingIndex = parent.childNodes.indexOf(heading);
    for (const sibling of parent.childNodes.slice(headingIndex + 1)) {
      if (isElement(sibling) && sibling.rawTagName === 'h2') break;
      nodes.push(sibling);
    }
  }

  const blocks: MdnContentBlock[] = [];
  for (const node of nodes) {
    collectBlocks(node, blocks);
    if (blocks.length >= 14) break;
  }
  return blocks.slice(0, 14);
}

function collectBlocks(node: HtmlNode, blocks: MdnContentBlock[]): void {
  if (blocks.length >= 14 || !isElement(node)) return;
  const tag = node.rawTagName;

  if (tag === 'p') {
    pushTextBlock(blocks, 'paragraph', node.innerText, 1200);
    return;
  }
  if (tag === 'h3' || tag === 'h4') {
    pushTextBlock(blocks, 'subheading', node.innerText, 240);
    return;
  }
  if (tag === 'pre') {
    const code = node.querySelector('code') ?? node;
    const text = code.innerText.replace(/^\n+|\n+$/g, '');
    if (text) {
      const className = code.getAttribute('class') ?? '';
      const language = className.match(/(?:language-|brush:\s*)([\w-]+)/i)?.[1];
      blocks.push({ type: 'code', text: limitText(text, 2400), language });
    }
    return;
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = node.childNodes
      .filter(isElement)
      .filter((child) => child.rawTagName === 'li')
      .map((child) => limitText(cleanText(child.innerText), 500))
      .filter(Boolean)
      .slice(0, 10);
    if (items.length) blocks.push({ type: 'list', items });
    return;
  }
  if (tag === 'dl') {
    const items = node.childNodes
      .filter(isElement)
      .filter((child) => child.rawTagName === 'dt' || child.rawTagName === 'dd')
      .map((child) => limitText(cleanText(child.innerText), 500))
      .filter(Boolean)
      .slice(0, 12);
    if (items.length) blocks.push({ type: 'list', items });
    return;
  }
  if (tag === 'table') {
    const items = node.querySelectorAll('tr')
      .map((row) => row.querySelectorAll('th, td').map((cell) => cleanText(cell.innerText)).filter(Boolean).join(' - '))
      .filter(Boolean)
      .slice(0, 10);
    if (items.length) blocks.push({ type: 'list', items });
    return;
  }

  for (const child of node.childNodes) {
    collectBlocks(child, blocks);
    if (blocks.length >= 14) break;
  }
}

function pushTextBlock(
  blocks: MdnContentBlock[],
  type: 'paragraph' | 'subheading',
  value: string,
  maxLength: number
): void {
  const text = limitText(cleanText(value), maxLength);
  if (text) blocks.push({ type, text });
}

function isElement(node: HtmlNode): node is HTMLElement {
  return typeof (node as HTMLElement).rawTagName === 'string';
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function limitText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function selectPropertyDocument(documents: MdnSearchDocument[], propertyName: string): MdnSearchDocument | undefined {
  const suffix = `/docs/web/css/reference/properties/${propertyName.toLowerCase()}`;
  return documents.find((document) => document.mdn_url.toLowerCase().endsWith(suffix));
}

export function toPlainText(value: string): string {
  return value
    .replace(/<\/?(?:mark|code|strong|em|b|i|span)(?:\s[^>]*)?>/gi, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function categoryFromMdnUrl(value: string): string {
  const path = value.toLowerCase();
  const categories: Array<[string, string]> = [
    ['/web/javascript/', 'JavaScript'],
    ['/web/api/', 'Web API'],
    ['/web/css/', 'CSS'],
    ['/web/html/', 'HTML'],
    ['/web/http/', 'HTTP'],
    ['/web/svg/', 'SVG'],
    ['/web/mathml/', 'MathML'],
    ['/webassembly/', 'WebAssembly'],
    ['/mozilla/add-ons/webextensions/', 'WebExtensions'],
    ['/learn_web_development/', 'Web 开发教程'],
    ['/mdn/', 'MDN']
  ];
  return categories.find(([fragment]) => path.includes(fragment))?.[1] ?? 'Web 技术';
}

async function fetchWithTimeout(url: URL, parentSignal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abort);
  }
}
