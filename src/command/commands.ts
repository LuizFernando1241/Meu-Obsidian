import type { NodeType } from '../data/types';
import type { IndexedTask } from '../tasks/taskIndex';

export type CreateTarget = 'current' | 'root';

export type TaskCommandAction =
  | 'set-focus'
  | 'schedule-today'
  | 'schedule-tomorrow'
  | 'schedule-next-week'
  | 'due-set'
  | 'toggle-next-action';

export type Command =
  | { kind: 'open'; id: string; title: string; subtitle?: string }
  | { kind: 'nav'; path: string; title: string; subtitle?: string }
  | {
      kind: 'create';
      nodeType: NodeType;
      title: string;
      subtitle?: string;
      target?: CreateTarget;
    }
  | { kind: 'task-action'; action: TaskCommandAction; title: string; subtitle?: string }
  | { kind: 'open-task'; title: string; task: IndexedTask; subtitle?: string };

export const getStaticCommands = () => ({
  nav: [
    { kind: 'nav', path: '/', title: 'Inicio' },
    { kind: 'nav', path: '/home', title: 'Hoje (Cockpit)' },
    { kind: 'nav', path: '/focus', title: 'Ir para Agora' },
    { kind: 'nav', path: '/today', title: 'Hoje (lista)' },
    { kind: 'nav', path: '/tasks', title: 'Painel' },
    { kind: 'nav', path: '/week', title: 'Planejar semana (view)' },
    { kind: 'nav', path: '/backlog', title: 'Backlog completo (view)' },
    { kind: 'nav', path: '/overdue', title: 'Atrasadas (view)' },
    { kind: 'nav', path: '/inbox', title: 'Ir para Inbox' },
    { kind: 'nav', path: '/notes', title: 'Registros' },
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
  taskActions: [
    { kind: 'task-action', action: 'set-focus', title: 'Definir foco (Agora)' },
    { kind: 'task-action', action: 'schedule-today', title: 'Agendar: Hoje' },
    { kind: 'task-action', action: 'schedule-tomorrow', title: 'Agendar: Amanha' },
    { kind: 'task-action', action: 'schedule-next-week', title: 'Agendar: Proxima semana' },
    { kind: 'task-action', action: 'due-set', title: 'Definir prazo (use uma data)' },
    { kind: 'task-action', action: 'toggle-next-action', title: 'Alternar proxima acao' },
  ] as Command[],
});
