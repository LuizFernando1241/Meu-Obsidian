import React from 'react';
import {
  Box,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useLocation } from 'react-router-dom';

import { SHORTCUTS } from '../app/shortcuts';
import { useNotifier } from '../components/Notifier';

const ShortcutRow = ({ name, keys, where, description }: (typeof SHORTCUTS)[0]) => (
  <Stack
    direction={{ xs: 'column', sm: 'row' }}
    spacing={1.5}
    alignItems={{ sm: 'center' }}
    sx={{
      py: 1.5,
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}
  >
    <Box
      sx={{
        minWidth: { sm: 180 },
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Typography variant="subtitle2">{name}</Typography>
      {where && (
        <Typography variant="caption" color="text.secondary">
          {where}
        </Typography>
      )}
    </Box>
    <Box
      sx={{
        minWidth: { sm: 180 },
        bgcolor: 'action.hover',
        px: 1,
        py: 0.5,
        borderRadius: 1,
        alignSelf: { xs: 'flex-start', sm: 'center' },
      }}
    >
      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
        {keys}
      </Typography>
    </Box>
    <Typography variant="body2" color="text.secondary">
      {description}
    </Typography>
  </Stack>
);

export default function HelpPage() {
  const notifier = useNotifier();
  const location = useLocation();
  const shortcutsRef = React.useRef<HTMLDivElement | null>(null);

  const handleScrollToShortcuts = () => {
    shortcutsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = `${window.location.origin}/help#shortcuts`;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        notifier.success('Link da ajuda copiado');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifier.error(`Falha ao copiar: ${message}`);
      }
      return;
    }
    notifier.info('Copie o link pela barra de endereco');
  };

  React.useEffect(() => {
    if (location.hash === '#shortcuts') {
      shortcutsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  return (
    <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto' }}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Ajuda / Atalhos
        </Typography>
        <Typography color="text.secondary">
          Guia rapido para organizar suas notas, tarefas e sincronizacao.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" onClick={handleScrollToShortcuts}>
            Ver atalhos
          </Button>
          <Button variant="outlined" onClick={handleCopyLink}>
            Copiar link da ajuda
          </Button>
        </Stack>
      </Stack>

      <Divider />

      <Stack spacing={2}>
        <Typography variant="h5">Como organizar</Typography>
        <List dense disablePadding>
          <ListItem>
            <ListItemText primary="Pastas organizam seu conteudo e podem conter subpastas e notas." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Notas ficam na raiz ou dentro de pastas. Notas na raiz aparecem como Notas rapidas." />
          </ListItem>
        </List>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="h5">Tarefas</Typography>
        <List dense disablePadding>
          <ListItem>
            <ListItemText primary="Tarefas sao checklists dentro das notas." />
          </ListItem>
          <ListItem>
            <ListItemText primary="As visoes Tarefas, Hoje e Atrasadas reunem checklists abertas." />
          </ListItem>
        </List>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="h5">Links</Typography>
        <List dense disablePadding>
          <ListItem>
            <ListItemText primary="Use [[nome]] para criar wikilinks entre notas." />
          </ListItem>
          <ListItem>
            <ListItemText primary="O grafo mostra as ligacoes entre notas." />
          </ListItem>
        </List>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="h5">Sincronizacao</Typography>
        <List dense disablePadding>
          <ListItem>
            <ListItemText primary="Configure Gist ID e Token em Configuracoes para ativar a sincronizacao." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Use Sincronizar agora para forcar a sincronizacao." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Se algo nao aparecer, tente Sincronizar agora ou Recarregar limpando cache." />
          </ListItem>
        </List>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="h5">Backup</Typography>
        <List dense disablePadding>
          <ListItem>
            <ListItemText primary="Exporte um backup JSON para manter uma copia local." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Importe um arquivo para substituir ou mesclar com seus dados atuais." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Use Resetar dados locais com cuidado e, se precisar, baixe do remoto." />
          </ListItem>
        </List>
      </Stack>

      <Divider />

      <Box ref={shortcutsRef} id="shortcuts">
        <Stack spacing={2}>
          <Typography variant="h5">Atalhos</Typography>
          <Stack spacing={0}>
            {SHORTCUTS.map((shortcut) => (
              <ShortcutRow key={shortcut.id} {...shortcut} />
            ))}
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}
