import type { NodeType } from '../data/types';

export type CreateTarget = 'current' | 'root';

export type Command =
  | { kind: 'open'; id: string; title: string; subtitle?: string }
  | { kind: 'nav'; path: string; title: string; subtitle?: string }
  | {
      kind: 'create';
      nodeType: NodeType;
      title: string;
      subtitle?: string;
      target?: CreateTarget;
    };

export const getStaticCommands = () => ({
  nav: [
    { kind: 'nav', path: '/', title: 'Inicio' },
    { kind: 'nav', path: '/tasks', title: 'Tarefas' },
    { kind: 'nav', path: '/notes', title: 'Notas' },
    { kind: 'nav', path: '/tags', title: 'Tags' },
    { kind: 'nav', path: '/graph', title: 'Grafo' },
    { kind: 'nav', path: '/help', title: 'Ajuda / Atalhos' },
    { kind: 'nav', path: '/help#shortcuts', title: 'Mostrar atalhos' },
    { kind: 'nav', path: '/settings', title: 'Configuracoes' },
  ] as Command[],
  create: [
    {
      kind: 'create',
      nodeType: 'note',
      title: 'Criar nota (na pasta atual)',
      target: 'current',
    },
    {
      kind: 'create',
      nodeType: 'folder',
      title: 'Criar pasta (na pasta atual)',
      target: 'current',
    },
  ] as Command[],
});
