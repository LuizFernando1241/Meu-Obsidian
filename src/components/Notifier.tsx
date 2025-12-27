import React from 'react';
import { Alert, Snackbar } from '@mui/material';

type Severity = 'success' | 'error' | 'info';

type NotifierContextValue = {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
};

type NotifierState = {
  open: boolean;
  message: string;
  severity: Severity;
  duration: number;
};

const NotifierContext = React.createContext<NotifierContextValue | null>(null);

const defaultState: NotifierState = {
  open: false,
  message: '',
  severity: 'info',
  duration: 3000,
};

export function NotifierProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<NotifierState>(defaultState);

  const notify = React.useCallback(
    (message: string, severity: Severity, duration = 3000) => {
      setState({ open: true, message, severity, duration });
    },
    [],
  );

  const value = React.useMemo<NotifierContextValue>(
    () => ({
      success: (message, duration) => notify(message, 'success', duration),
      error: (message, duration) => notify(message, 'error', duration),
      info: (message, duration) => notify(message, 'info', duration),
    }),
    [notify],
  );

  const handleClose = () => setState((prev) => ({ ...prev, open: false }));

  return (
    <NotifierContext.Provider value={value}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={state.duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleClose} severity={state.severity} variant="filled">
          {state.message}
        </Alert>
      </Snackbar>
    </NotifierContext.Provider>
  );
}

export const useNotifier = () => {
  const context = React.useContext(NotifierContext);
  if (!context) {
    throw new Error('useNotifier must be used within NotifierProvider');
  }
  return context;
};
