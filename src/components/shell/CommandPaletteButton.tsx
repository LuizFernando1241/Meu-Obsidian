import { IconButton, Tooltip } from '@mui/material';
import { Bolt } from '@mui/icons-material';

type CommandPaletteButtonProps = {
  onOpen: () => void;
};

export default function CommandPaletteButton({ onOpen }: CommandPaletteButtonProps) {
  return (
    <Tooltip title="Paleta de comandos">
      <IconButton color="inherit" onClick={onOpen} aria-label="Paleta de comandos">
        <Bolt />
      </IconButton>
    </Tooltip>
  );
}
