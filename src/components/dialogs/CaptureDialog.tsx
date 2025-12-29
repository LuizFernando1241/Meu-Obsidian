import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useIsMobile } from '../../app/useIsMobile';

type CaptureMode = 'quick' | 'daily';

type CaptureDialogProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (payload: { text: string; mode: CaptureMode }) => void | Promise<void>;
};

export default function CaptureDialog({ open, onClose, onCapture }: CaptureDialogProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = React.useState<CaptureMode>('quick');
  const [text, setText] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setMode('quick');
      setText('');
    }
  }, [open]);

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    onCapture({ text: trimmed, mode });
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
          />
          <FormControl>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Destino
            </Typography>
            <RadioGroup
              value={mode}
              onChange={(event) => setMode(event.target.value as CaptureMode)}
            >
              <FormControlLabel
                value="quick"
                control={<Radio />}
                label="Criar nota rapida na raiz"
              />
              <FormControlLabel
                value="daily"
                control={<Radio />}
                label="Adicionar na nota diaria (Capturas - YYYY-MM-DD)"
              />
            </RadioGroup>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{ flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch' }}
      >
        <Button onClick={onClose} sx={{ width: isMobile ? '100%' : 'auto' }}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={handleConfirm} sx={{ width: isMobile ? '100%' : 'auto' }}>
          Capturar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
