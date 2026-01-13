import React from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useIsMobile } from '../../app/useIsMobile';

type CaptureDialogProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (payload: { text: string; logDaily: boolean }) => void | Promise<void>;
};

export default function CaptureDialog({ open, onClose, onCapture }: CaptureDialogProps) {
  const isMobile = useIsMobile();
  const [logDaily, setLogDaily] = React.useState(false);
  const [text, setText] = React.useState('');
  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0;

  React.useEffect(() => {
    if (open) {
      setLogDaily(false);
      setText('');
    }
  }, [open]);

  const handleConfirm = () => {
    if (!canSubmit) {
      return;
    }
    onCapture({ text: trimmed, logDaily });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}>
      <DialogTitle>Captura rapida</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Texto"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Digite algo para capturar..."
            multiline
            minRows={3}
            fullWidth
            autoFocus
            error={text.length > 0 && !canSubmit}
            helperText={canSubmit ? undefined : 'Digite algo para capturar.'}
          />
          <FormControl>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Destino
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inbox (padrao)
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={logDaily}
                  onChange={(event) => setLogDaily(event.target.checked)}
                />
              }
              label="Adicionar tambem ao diario (Capturas - YYYY-MM-DD)"
            />
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{ flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch' }}
      >
        <Button onClick={onClose} sx={{ width: isMobile ? '100%' : 'auto' }}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!canSubmit}
          sx={{ width: isMobile ? '100%' : 'auto' }}
        >
          Capturar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
