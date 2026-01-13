import React from 'react';

const COCKPIT_KEY = 'ui.cockpit';

const readFlag = (key: string, fallback = false) => {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === '1' || raw === 'true') {
    return true;
  }
  if (raw === '0' || raw === 'false') {
    return false;
  }
  return fallback;
};

const writeFlag = (key: string, value: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(key, value ? '1' : '0');
  window.dispatchEvent(new CustomEvent('ui-flag-change', { detail: { key } }));
};

export const isCockpitEnabled = () => readFlag(COCKPIT_KEY, false);

export const setCockpitEnabled = (enabled: boolean) => {
  writeFlag(COCKPIT_KEY, enabled);
};

export const useCockpitEnabled = () => {
  const [enabled, setEnabled] = React.useState(isCockpitEnabled);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === COCKPIT_KEY) {
        setEnabled(isCockpitEnabled());
      }
    };
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent).detail as { key?: string } | undefined;
      if (detail?.key === COCKPIT_KEY) {
        setEnabled(isCockpitEnabled());
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('ui-flag-change', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('ui-flag-change', handleCustom);
    };
  }, []);

  return [enabled, setCockpitEnabled] as const;
};
