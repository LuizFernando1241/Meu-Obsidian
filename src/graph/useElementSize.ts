import { useLayoutEffect, useRef, useState } from 'react';

export const useElementSize = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, size };
};
