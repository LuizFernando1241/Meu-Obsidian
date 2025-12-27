import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import type { PaletteMode } from '@mui/material';

import { createAppTheme } from './theme';

type ColorModeContextValue = {
  mode: PaletteMode;
  toggleColorMode: () => void;
};

const STORAGE_KEY = 'mf_color_mode';

const ColorModeContext = React.createContext<ColorModeContextValue | undefined>(undefined);

const getInitialMode = (): PaletteMode => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'light';
};

export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<PaletteMode>(getInitialMode);

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = React.useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
      },
    }),
    [mode],
  );

  const theme = React.useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode() {
  const context = React.useContext(ColorModeContext);
  if (!context) {
    throw new Error('useColorMode must be used within ColorModeProvider');
  }

  return context;
}
