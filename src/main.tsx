import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import { ColorModeProvider } from './app/ColorModeContext';
import { NotifierProvider } from './components/Notifier';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColorModeProvider>
      <NotifierProvider>
        <App />
      </NotifierProvider>
    </ColorModeProvider>
  </React.StrictMode>,
);
