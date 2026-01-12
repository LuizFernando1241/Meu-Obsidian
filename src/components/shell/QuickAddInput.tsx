import React from 'react';
import { IconButton, Stack, TextField, Tooltip } from '@mui/material';
import { Send } from '@mui/icons-material';

import { createInboxItem } from '../../data/inbox';
import { useNotifier } from '../Notifier';
import { useSpaceStore } from '../../store/useSpaceStore';

type QuickAddInputProps = {
  placeholder?: string;
  size?: 'small' | 'medium';
};

export default function QuickAddInput({
  placeholder = 'Adicionar a inbox...',
  size = 'small',
}: QuickAddInputProps) {
  const notifier = useNotifier();
  const space = useSpaceStore((state) => state.space);
  const [value, setValue] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSubmit = React.useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await createInboxItem(trimmed, space);
      setValue('');
      notifier.success('Enviado para inbox');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao capturar: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, notifier, space, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size={size}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isSaving}
        inputProps={{ 'aria-label': 'Adicionar item na inbox' }}
      />
      <Tooltip title="Enviar para inbox">
        <span>
          <IconButton
            color="primary"
            size={size}
            onClick={() => void handleSubmit()}
            disabled={isSaving || !value.trim()}
            aria-label="Enviar para inbox"
          >
            <Send fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
