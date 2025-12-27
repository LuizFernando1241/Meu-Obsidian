import { addDays, subDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

import { db } from './db';
import { createItem } from './repo';
import type { Block } from './types';

const makeParagraph = (text: string): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text,
});

const makeContent = (text: string) => [makeParagraph(text)];

export const ensureSeedData = async () => {
  const count = await db.items.count();
  if (count > 0) {
    return;
  }

  await createItem({
    type: 'project',
    title: 'App Pessoal',
    content: makeContent('Projeto base do Mecflux Personal OS.'),
    tags: ['mecflux', 'sistema'],
  });

  await createItem({
    type: 'area',
    title: 'Saúde',
    content: makeContent('Rotinas e acompanhamentos pessoais.'),
    tags: ['saúde'],
  });

  await createItem({
    type: 'note',
    title: 'Boas-vindas',
    content: makeContent('Este é o seu espaço pessoal.'),
    tags: ['inbox'],
    favorite: true,
  });

  await createItem({
    type: 'note',
    title: 'Ideias do projeto',
    content: makeContent('Rascunhos para [[App Pessoal]] e fluxo principal.'),
    tags: ['mecflux', 'ideias'],
  });

  const now = new Date();

  await createItem({
    type: 'task',
    title: 'Definir objetivos da semana',
    content: makeContent('Liste as três metas principais.'),
    status: 'todo',
    dueDate: addDays(now, 2).getTime(),
    tags: ['planejamento'],
  });

  await createItem({
    type: 'task',
    title: 'Revisar hábitos de sono',
    content: makeContent('Comparar rotina com a área Saúde.'),
    status: 'doing',
    dueDate: addDays(now, 1).getTime(),
    tags: ['saúde'],
  });

  await createItem({
    type: 'task',
    title: 'Organizar notas antigas',
    content: makeContent('Limpar tags e atualizar links.'),
    status: 'done',
    doneAt: subDays(now, 1).getTime(),
    tags: ['organização'],
  });
};
