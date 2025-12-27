import { parseWikilinks, replaceRange } from './wikilinks';

type ResolveResult =
  | { status: 'ok'; id: string }
  | { status: 'ambiguous'; ids: string[] }
  | { status: 'not_found' };

type Resolver = (title: string) => Promise<ResolveResult>;

export const upgradeLegacyLinksInText = async (
  text: string,
  resolver: Resolver,
): Promise<{ text: string; changed: boolean; hadAmbiguity: boolean }> => {
  if (!text) {
    return { text, changed: false, hadAmbiguity: false };
  }

  const links = parseWikilinks(text).filter((link) => link.kind === 'title' && link.title);
  if (links.length === 0) {
    return { text, changed: false, hadAmbiguity: false };
  }

  let nextText = text;
  let changed = false;
  let hadAmbiguity = false;

  const replacements: Array<{ start: number; end: number; replacement: string }> = [];
  for (const link of links) {
    const title = link.title ?? '';
    if (!title) {
      continue;
    }
    const resolved = await resolver(title);
    if (resolved.status === 'ok') {
      replacements.push({
        start: link.start,
        end: link.end,
        replacement: `[[id:${resolved.id}|${title}]]`,
      });
    } else {
      hadAmbiguity = true;
    }
  }

  if (replacements.length === 0) {
    return { text, changed: false, hadAmbiguity };
  }

  replacements
    .sort((a, b) => b.start - a.start)
    .forEach((rep) => {
      nextText = replaceRange(nextText, rep.start, rep.end, rep.replacement);
      changed = true;
    });

  return { text: nextText, changed, hadAmbiguity };
};
