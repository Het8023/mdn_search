const PROPERTY_PATTERN = /--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9_-]*/g;

export function normalizePropertyCandidate(input: string): string | undefined {
  const text = input.trim();
  if (!text || text.length > 200) {
    return undefined;
  }

  const declaration = text.match(/(?:^|[;{]\s*)(--[\w-]+|-?[a-zA-Z][\w-]*)\s*:/);
  if (declaration) {
    return declaration[1].toLowerCase();
  }

  const matches = text.match(PROPERTY_PATTERN);
  if (!matches || matches.length !== 1) {
    return undefined;
  }

  const candidate = matches[0].toLowerCase();
  return candidate.length <= 100 ? candidate : undefined;
}

export function normalizeSearchQuery(input: string): string | undefined {
  const query = input.trim().replace(/\s+/g, ' ');
  if (!query || query.length > 200 || /[\r\n]/.test(query)) {
    return undefined;
  }
  return query.replace(/^[`'\"]+|[`'\";,]+$/g, '').trim() || undefined;
}

export function extractSearchTokenFromLine(line: string, character: number): string | undefined {
  const safeCharacter = Math.max(0, Math.min(character, Math.max(0, line.length - 1)));
  let start = safeCharacter;
  let end = safeCharacter;
  const isTokenCharacter = (value: string | undefined) => Boolean(value && /[\w$.-]/.test(value));

  if (!isTokenCharacter(line[start]) && start > 0) {
    start -= 1;
    end -= 1;
  }
  if (!isTokenCharacter(line[start])) return undefined;

  while (start > 0 && isTokenCharacter(line[start - 1])) start -= 1;
  while (end + 1 < line.length && isTokenCharacter(line[end + 1])) end += 1;
  return normalizeSearchQuery(line.slice(start, end + 1));
}

export function extractPropertyFromLine(line: string, character: number): string | undefined {
  const safeCharacter = Math.max(0, Math.min(character, line.length));
  let start = safeCharacter;
  let end = safeCharacter;

  if (start === line.length || !/[\w-]/.test(line[start] ?? '')) {
    start -= 1;
    end -= 1;
  }
  if (start < 0 || !/[\w-]/.test(line[start] ?? '')) {
    return undefined;
  }

  while (start > 0 && /[\w-]/.test(line[start - 1])) {
    start -= 1;
  }
  while (end + 1 < line.length && /[\w-]/.test(line[end + 1])) {
    end += 1;
  }

  const candidate = normalizePropertyCandidate(line.slice(start, end + 1));
  if (!candidate) {
    return undefined;
  }

  const boundary = Math.max(line.lastIndexOf(';', start), line.lastIndexOf('{', start));
  const colon = line.indexOf(':', boundary + 1);
  if (colon === -1 || end >= colon) {
    return undefined;
  }

  return candidate;
}

export function findPropertyRange(line: string, character: number): { start: number; end: number } | undefined {
  const safeCharacter = Math.max(0, Math.min(character, Math.max(0, line.length - 1)));
  let start = safeCharacter;
  let end = safeCharacter;
  if (!/[\w-]/.test(line[start] ?? '') && start > 0) {
    start -= 1;
    end -= 1;
  }
  if (!/[\w-]/.test(line[start] ?? '')) {
    return undefined;
  }
  while (start > 0 && /[\w-]/.test(line[start - 1])) start -= 1;
  while (end + 1 < line.length && /[\w-]/.test(line[end + 1])) end += 1;
  return { start, end: end + 1 };
}
