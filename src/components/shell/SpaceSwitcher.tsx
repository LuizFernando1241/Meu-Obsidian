import type { MouseEvent } from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';

import type { Space } from '../../data/types';
import { useSpaceStore } from '../../store/useSpaceStore';

type SpaceSwitcherProps = {
  size?: 'small' | 'medium';
};

export default function SpaceSwitcher({ size = 'small' }: SpaceSwitcherProps) {
  const { space, setSpace } = useSpaceStore((state) => ({
    space: state.space,
    setSpace: state.setSpace,
  }));

  const handleChange = (event: MouseEvent<HTMLElement>, value: Space | null) => {
    void event;
    if (!value) {
      return;
    }
    setSpace(value);
  };

  return (
    <Tooltip title="Selecionar espaço">
      <ToggleButtonGroup
        size={size}
        value={space}
        exclusive
        onChange={handleChange}
        aria-label="Selecionar espaço"
      >
        <ToggleButton value="WORK" aria-label="Trabalho">
          Trabalho
        </ToggleButton>
        <ToggleButton value="PERSONAL" aria-label="Pessoal">
          Pessoal
        </ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  );
}
