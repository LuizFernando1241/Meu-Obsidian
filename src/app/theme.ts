import { alpha, createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

const buildPalette = (mode: PaletteMode) => {
  const isLight = mode === 'light';
  return {
    mode,
    primary: {
      main: isLight ? '#1B9AAA' : '#6FD3C8',
      contrastText: isLight ? '#FFFFFF' : '#0B0F12',
    },
    secondary: {
      main: isLight ? '#E07A5F' : '#F2A07B',
      contrastText: isLight ? '#1B1B1B' : '#0B0F12',
    },
    success: { main: isLight ? '#2A9D8F' : '#53C5B7' },
    warning: { main: isLight ? '#E9C46A' : '#F0D28A' },
    error: { main: isLight ? '#E76F51' : '#F08A6E' },
    background: {
      default: isLight ? '#F6F0E6' : '#111416',
      paper: isLight ? '#FCFBF9' : '#171B1F',
    },
    text: {
      primary: isLight ? '#1F2A33' : '#E8E1D8',
      secondary: isLight ? '#55636F' : '#A3AEB8',
    },
    divider: isLight ? 'rgba(31, 42, 51, 0.12)' : 'rgba(232, 225, 216, 0.12)',
  };
};

export const createAppTheme = (mode: PaletteMode) => {
  const isLight = mode === 'light';
  const palette = buildPalette(mode);
  const surfaceShadow = isLight
    ? '0 12px 30px rgba(31, 42, 51, 0.08)'
    : '0 12px 30px rgba(0, 0, 0, 0.45)';

  return createTheme({
    palette,
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily:
        '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", "Noto Sans", sans-serif',
      h1: { fontWeight: 700, letterSpacing: -0.5 },
      h2: { fontWeight: 700, letterSpacing: -0.3 },
      h3: { fontWeight: 700, letterSpacing: -0.2 },
      h4: { fontWeight: 700, letterSpacing: -0.1 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: isLight
              ? 'radial-gradient(circle at 15% 15%, #FFF8EF, #F6F0E6 60%)'
              : 'radial-gradient(circle at 15% 15%, #1B2228, #111416 60%)',
            backgroundAttachment: 'fixed',
          },
          '#root': {
            minHeight: '100vh',
          },
          '*::selection': {
            backgroundColor: alpha(palette.primary.main, 0.2),
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background.paper,
            borderBottom: `1px solid ${palette.divider}`,
            boxShadow: 'none',
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: 64,
            paddingLeft: 16,
            paddingRight: 16,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          elevation1: {
            boxShadow: surfaceShadow,
            border: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${palette.divider}`,
            backgroundImage: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            paddingLeft: 14,
            paddingRight: 14,
            boxShadow: 'none',
          },
          contained: {
            boxShadow: isLight
              ? '0 8px 18px rgba(27, 154, 170, 0.2)'
              : '0 8px 18px rgba(8, 12, 16, 0.4)',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 500,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: isLight ? '#FFFFFF' : '#1C2126',
            borderRadius: 10,
          },
          notchedOutline: {
            borderColor: alpha(palette.text.primary, isLight ? 0.12 : 0.2),
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontWeight: 500,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            marginLeft: 8,
            marginRight: 8,
            marginTop: 2,
            marginBottom: 2,
            '&.Mui-selected': {
              backgroundColor: alpha(palette.primary.main, 0.12),
            },
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: palette.divider,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            boxShadow: surfaceShadow,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            border: `1px solid ${palette.divider}`,
            boxShadow: surfaceShadow,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 700,
            backgroundColor: alpha(palette.text.primary, isLight ? 0.03 : 0.08),
          },
        },
      },
    },
  });
};
