import React from 'react';

const DEFAULT_QUERY = '(max-width: 900px)';

const getMatches = (query: string) => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(query).matches;
};

export const useIsMobile = (query: string = DEFAULT_QUERY) => {
  const [isMobile, setIsMobile] = React.useState(() => getMatches(query));

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia(query);
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    if (media.addEventListener) {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [query]);

  return isMobile;
};
