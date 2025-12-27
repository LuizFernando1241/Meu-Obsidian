import type { ItemType } from '../data/types';

export type Command =
  | { kind: 'open'; id: string; title: string; subtitle?: string }
  | { kind: 'nav'; path: string; title: string; subtitle?: string }
  | { kind: 'create'; itemType: ItemType; title: string; subtitle?: string };

export const getStaticCommands = () => ({
  nav: [
    { kind: 'nav', path: '/', title: 'Home' },
    { kind: 'nav', path: '/today', title: 'Hoje' },
    { kind: 'nav', path: '/tasks', title: 'Tarefas' },
    { kind: 'nav', path: '/projects', title: 'Projetos' },
    { kind: 'nav', path: '/areas', title: 'Áreas' },
    { kind: 'nav', path: '/notes', title: 'Notas' },
    { kind: 'nav', path: '/tags', title: 'Tags' },
    { kind: 'nav', path: '/graph', title: 'Grafo' },
  ] as Command[],
  create: [
    { kind: 'create', itemType: 'note', title: 'Criar nota' },
    { kind: 'create', itemType: 'task', title: 'Criar tarefa' },
    { kind: 'create', itemType: 'project', title: 'Criar projeto' },
    { kind: 'create', itemType: 'area', title: 'Criar área' },
  ] as Command[],
});
