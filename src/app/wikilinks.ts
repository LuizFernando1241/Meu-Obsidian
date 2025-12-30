export type ParsedWikilink = {
  start: number;
  end: number;
  raw: string;
  kind: 'id' | 'title' | 'target';
  id?: string;
  title?: string;
  display?: string;
  target?: string;
};

export type WikilinkSnippet = {
  snippet: string;
  start: number;
  end: number;
};

export const parseWikilinks = (text: string): ParsedWikilink[] => {
  if (!text) {
    return [];
  }

  const matches: ParsedWikilink[] = [];
  const regex = /\[\[([^\]\n]+)\]\][ \t]*(?:\(([^)\n]+)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const raw = match[0];
    const content = match[1]?.trim() ?? '';
    const targetRaw = match[2]?.trim() ?? '';
    if (!content) {
      continue;
    }

    if (targetRaw) {
      if (targetRaw.toLowerCase().startsWith('id:')) {
        const id = targetRaw.slice(3).trim();
        if (id) {
          matches.push({
            start: match.index,
            end: match.index + raw.length,
            raw,
            kind: 'id',
            id,
            display: content,
          });
          continue;
        }
      }
      matches.push({
        start: match.index,
        end: match.index + raw.length,
        raw,
        kind: 'target',
        target: targetRaw,
        display: content,
      });
      continue;
    }

    if (content.toLowerCase().startsWith('id:')) {
      const rest = content.slice(3);
      const pipeIndex = rest.indexOf('|');
      const idPart = pipeIndex === -1 ? rest : rest.slice(0, pipeIndex);
      const displayPart = pipeIndex === -1 ? '' : rest.slice(pipeIndex + 1);
      const id = idPart?.trim();
      const display = displayPart?.trim();
      if (id) {
        matches.push({
          start: match.index,
          end: match.index + raw.length,
          raw,
          kind: 'id',
          id,
          display,
        });
        continue;
      }
    }

    matches.push({
      start: match.index,
      end: match.index + raw.length,
      raw,
      kind: 'title',
      title: content,
    });
  }

  return matches;
};

export const splitTitleAndAnchor = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { title: '', anchor: undefined as string | undefined };
  }
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex === -1) {
    return { title: trimmed, anchor: undefined as string | undefined };
  }
  const title = trimmed.slice(0, hashIndex).trim();
  const anchor = trimmed.slice(hashIndex + 1).trim();
  return { title, anchor: anchor || undefined };
};

export const extractLinkTargets = (text: string) => {
  const links = parseWikilinks(text);
  const ids: string[] = [];
  const titles: string[] = [];

  for (const link of links) {
    if (link.kind === 'id' && link.id) {
      ids.push(link.id);
    }
    if (link.kind === 'title' && link.title) {
      const { title } = splitTitleAndAnchor(link.title);
      if (title) {
        titles.push(title);
      }
    }
    if (link.kind === 'target' && link.target) {
      const normalized = link.target.trim();
      if (!normalized) {
        continue;
      }
      if (normalized.toLowerCase().startsWith('id:')) {
        const rawId = normalized.slice(3).trim();
        const { title: id } = splitTitleAndAnchor(rawId);
        if (id) {
          ids.push(id);
        }
        continue;
      }
      if (isExternalLinkTarget(normalized)) {
        continue;
      }
      const { title } = splitTitleAndAnchor(normalized);
      if (title) {
        titles.push(title);
      }
    }
  }

  return { ids, titles };
};

export const replaceRange = (
  text: string,
  start: number,
  end: number,
  replacement: string,
): string => {
  if (start < 0 || end < start) {
    return text;
  }
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
};

const normalizeSnippet = (text: string) => text.replace(/\s+/g, ' ').trim();

export const findWikilinkSnippets = (
  text: string,
  target: { id?: string; title?: string },
): WikilinkSnippet[] => {
  if (!text) {
    return [];
  }
  const titleNeedle = target.title?.trim().toLowerCase();
  const idNeedle = target.id?.trim();
  const results: WikilinkSnippet[] = [];
  const links = parseWikilinks(text);
  links.forEach((link) => {
    const linkTitle =
      link.kind === 'title' && link.title
        ? splitTitleAndAnchor(link.title).title.trim().toLowerCase()
        : undefined;
    const targetTitle =
      link.kind === 'target' && link.target
        ? splitTitleAndAnchor(link.target).title.trim().toLowerCase()
        : undefined;
    const isMatch =
      (idNeedle && link.kind === 'id' && link.id === idNeedle) ||
      (titleNeedle && linkTitle && linkTitle === titleNeedle) ||
      (titleNeedle && targetTitle && targetTitle === titleNeedle);
    if (!isMatch) {
      return;
    }
    const start = Math.max(0, link.start - 60);
    const end = Math.min(text.length, link.end + 60);
    const raw = text.slice(start, end);
    const snippet = `${start > 0 ? '...' : ''}${normalizeSnippet(raw)}${
      end < text.length ? '...' : ''
    }`;
    results.push({ snippet, start: link.start, end: link.end });
  });
  return results;
};

export const isExternalLinkTarget = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  const lower = normalized.toLowerCase();
  if (lower.startsWith('id:')) {
    return false;
  }
  if (lower.startsWith('www.')) {
    return true;
  }
  return /^[a-z][a-z0-9+.-]*:/.test(normalized);
};
