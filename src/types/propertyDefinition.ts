export interface CompatibilityEntry {
  browser: string;
  version: string | true;
}

export interface PropertyStatus {
  deprecated: boolean;
  experimental: boolean;
  standard_track: boolean;
}

export interface CssPropertyRecord {
  name: string;
  syntax?: string;
  initialValue?: string;
  inherited?: boolean;
  appliesTo?: string;
  computedValue?: string;
  animationType?: string;
  status: PropertyStatus;
  compatibility: CompatibilityEntry[];
  mdnUrl: string;
  specUrl?: string;
}

export interface PropertyDefinition extends CssPropertyRecord {
  locale: 'zh-CN' | 'en-US';
  summary?: string;
  source: 'network' | 'cache' | 'local';
}

export interface MdnDocumentResult {
  title: string;
  summary: string;
  mdnUrl: string;
  locale: 'zh-CN' | 'en-US';
  category: string;
}

export interface MdnContentBlock {
  type: 'paragraph' | 'subheading' | 'code' | 'list';
  text?: string;
  language?: string;
  items?: string[];
}

export interface MdnContentSection {
  title: string;
  blocks: MdnContentBlock[];
}

export interface MdnPageDetail extends MdnDocumentResult {
  sections: MdnContentSection[];
  baseline?: string;
}

export interface SearchResult {
  definition?: PropertyDefinition;
  documents?: MdnDocumentResult[];
  query: string;
  suggestions: string[];
  error?: string;
}
