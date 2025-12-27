import { v4 as uuidv4 } from 'uuid';

import type { Block } from '../data/types';

export type Template = {
  id: string;
  name: string;
  content: Block[];
};

const templates: Template[] = [
  {
    id: 'simple',
    name: 'Nota simples',
    content: [
      {
        id: 'tpl-simple-1',
        type: 'paragraph',
        text: '',
      },
    ],
  },
  {
    id: 'list',
    name: 'Lista',
    content: [
      {
        id: 'tpl-list-1',
        type: 'checklist',
        text: '',
        checked: false,
      },
      {
        id: 'tpl-list-2',
        type: 'checklist',
        text: '',
        checked: false,
      },
      {
        id: 'tpl-list-3',
        type: 'checklist',
        text: '',
        checked: false,
      },
    ],
  },
  {
    id: 'meeting',
    name: 'Reuniao',
    content: [
      {
        id: 'tpl-meeting-1',
        type: 'h2',
        text: 'Reuniao',
      },
      {
        id: 'tpl-meeting-2',
        type: 'bullet',
        text: 'Participantes',
      },
      {
        id: 'tpl-meeting-3',
        type: 'bullet',
        text: 'Pauta',
      },
      {
        id: 'tpl-meeting-4',
        type: 'bullet',
        text: 'Proximos passos',
      },
    ],
  },
];

export const getTemplates = () => templates;

export const getTemplateContent = (templateId?: string): Block[] => {
  const template = templates.find((entry) => entry.id === templateId) ?? templates[0];
  return template.content.map((block) => {
    const cloned: Block = {
      ...block,
      id: uuidv4(),
    };
    if (cloned.type === 'checklist') {
      cloned.checked = cloned.checked ?? false;
      cloned.createdAt = cloned.createdAt ?? Date.now();
      if (cloned.checked && cloned.doneAt == null) {
        cloned.doneAt = Date.now();
      }
    }
    return cloned;
  });
};
