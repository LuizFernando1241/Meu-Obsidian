import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';

import { getTemplates } from '../../vault/templates';
import { useIsMobile } from '../../app/useIsMobile';

type NewNoteDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { title?: string; templateId: string }) => void;
};

export default function NewNoteDialog({ open, onClose, onConfirm }: NewNoteDialogProps) {
  const isMobile = useIsMobile();
  const templates = React.useMemo(() => getTemplates(), []);
  const [title, setTitle] = React.useState('');
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? '');

  React.useEffect(() => {
    if (open) {
      setTitle('');
      setTemplateId(templates[0]?.id ?? '');
    }
  }, [open, templates]);

  const handleConfirm = () => {
    onConfirm({ title: title.trim() || undefined, templateId });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}>
      <DialogTitle>Criar nota</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Titulo"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            fullWidth
          />
          <TextField
            select
            label="Template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            fullWidth
          >
            {templates.map((template) => (
              <MenuItem key={template.id} value={template.id}>
                {template.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{ flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch' }}
      >
        <Button onClick={onClose} sx={{ width: isMobile ? '100%' : 'auto' }}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} variant="contained" sx={{ width: isMobile ? '100%' : 'auto' }}>
          Criar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
