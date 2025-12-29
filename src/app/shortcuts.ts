export type Shortcut = {
  id: string;
  name: string;
  keys: string;
  where?: string;
  description: string;
};

export const SHORTCUTS: Shortcut[] = [
  {
    id: 'palette',
    name: 'Command Palette',
    keys: 'Ctrl+K / Cmd+K',
    where: 'Global',
    description: 'Abrir comandos e acoes rapidas.',
  },
  {
    id: 'search',
    name: 'Buscar',
    keys: 'Ctrl+P / Cmd+P',
    where: 'Global',
    description: 'Alternar a busca global (Ctrl+/ abre direto).',
  },
  {
    id: 'help',
    name: 'Ajuda / Atalhos',
    keys: '?',
    where: 'Global',
    description: 'Abrir a pagina de ajuda e atalhos.',
  },
  {
    id: 'new-note',
    name: 'Nova nota rapida',
    keys: 'Ctrl+N / Cmd+N',
    where: 'Global',
    description: 'Criar nota rapida e abrir no editor.',
  },
  {
    id: 'new-folder',
    name: 'Nova pasta rapida',
    keys: 'Ctrl+Shift+N / Cmd+Shift+N',
    where: 'Global',
    description: 'Criar pasta rapida.',
  },
  {
    id: 'capture',
    name: 'Captura rapida',
    keys: 'Ctrl+Shift+C / Cmd+Shift+C',
    where: 'Global',
    description: 'Abrir a captura rapida.',
  },
  {
    id: 'close-dialog',
    name: 'Fechar modais',
    keys: 'Esc',
    where: 'Global',
    description: 'Fechar busca, palette ou dialogs.',
  },
  {
    id: 'search-nav',
    name: 'Navegar resultados',
    keys: 'Seta Cima / Seta Baixo',
    where: 'Busca',
    description: 'Mover entre resultados.',
  },
  {
    id: 'search-open',
    name: 'Abrir resultado',
    keys: 'Enter',
    where: 'Busca',
    description: 'Abrir o item selecionado.',
  },
  {
    id: 'palette-nav',
    name: 'Navegar comandos',
    keys: 'Seta Cima / Seta Baixo',
    where: 'Palette',
    description: 'Mover entre comandos.',
  },
  {
    id: 'palette-exec',
    name: 'Executar comando',
    keys: 'Enter',
    where: 'Palette',
    description: 'Executar o comando selecionado.',
  },
  {
    id: 'editor-undo',
    name: 'Desfazer',
    keys: 'Ctrl+Z / Cmd+Z',
    where: 'Editor',
    description: 'Desfazer a ultima alteracao.',
  },
  {
    id: 'editor-redo',
    name: 'Refazer',
    keys: 'Ctrl+Y ou Ctrl+Shift+Z',
    where: 'Editor',
    description: 'Refazer a ultima alteracao.',
  },
  {
    id: 'editor-new-block',
    name: 'Novo bloco',
    keys: 'Enter',
    where: 'Editor',
    description: 'Criar um novo bloco logo abaixo.',
  },
  {
    id: 'editor-delete-block',
    name: 'Remover bloco vazio',
    keys: 'Backspace',
    where: 'Editor',
    description: 'Apagar bloco vazio e voltar para o anterior.',
  },
];
