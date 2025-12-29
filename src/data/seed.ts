import { v4 as uuidv4 } from 'uuid';

import { db } from './db';
import { createFolder, createNote, ensureDefaultSchema } from './repo';
import type { Block } from './types';

const makeParagraph = (text: string): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text,
});

const makeContent = (text: string) => [makeParagraph(text)];

export const ensureSeedData = async () => {
  await ensureDefaultSchema();
  const count = await db.items.count();
  if (count > 0) {
    return;
  }

  const appFolder = await createFolder({
    title: 'App Pessoal',
    tags: ['mecflux', 'sistema'],
  });

  await createFolder({
    title: 'Saude',
    tags: ['saude'],
  });

  await createNote({
    title: 'Boas-vindas',
    content: makeContent('Este e o seu espaco pessoal.'),
    tags: ['inbox'],
    favorite: true,
  });

  await createNote({
    title: 'Ideias do projeto',
    content: makeContent('Rascunhos para [[App Pessoal]] e fluxo principal.'),
    tags: ['mecflux', 'ideias'],
    parentId: appFolder.id,
  });
};
