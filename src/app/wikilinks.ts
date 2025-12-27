export type ParsedWikilink = {
  start: number;
  end: number;
  raw: string;
  kind: 'id' | 'title';
  id?: string;
  title?: string;
  display?: string;
};

export const parseWikilinks = (text: string): ParsedWikilink[] => {
  if (!text) {
    return [];
  }

  const matches: ParsedWikilink[] = [];
  const regex = /\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const raw = match[0];
    const content = match[1]?.trim() ?? '';
    if (!content) {
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

export const extractLinkTargets = (text: string) => {
  const links = parseWikilinks(text);
  const ids: string[] = [];
  const titles: string[] = [];

  for (const link of links) {
    if (link.kind === 'id' && link.id) {
      ids.push(link.id);
    }
    if (link.kind === 'title' && link.title) {
      titles.push(link.title);
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
