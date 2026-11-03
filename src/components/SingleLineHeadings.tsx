import { useLayoutEffect } from 'react';

const selector = 'h1, h2, h3, h4, h5, h6, [data-single-line-title]';

export default function SingleLineHeadings() {
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    let frame = 0;
    let disposed = false;
    const originals = new Map<HTMLElement, { value: string; priority: string }>();
    const restore = (heading: HTMLElement) => {
      const original = originals.get(heading);
      if (original?.value) heading.style.setProperty('font-size', original.value, original.priority);
      else heading.style.removeProperty('font-size');
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(fit);
    };
    const resize = new ResizeObserver(schedule);
    function fit() {
      frame = 0;
      for (const [heading] of originals) {
        if (!root!.contains(heading)) {
          resize.unobserve(heading);
          restore(heading);
          originals.delete(heading);
        }
      }
      for (const heading of root!.querySelectorAll<HTMLElement>(selector)) {
        if (!originals.has(heading)) {
          originals.set(heading, {
            value: heading.style.getPropertyValue('font-size'),
            priority: heading.style.getPropertyPriority('font-size'),
          });
          resize.observe(heading);
        }
        restore(heading);
        if (!heading.clientWidth) continue;
        const style = getComputedStyle(heading);
        const fontSize = parseFloat(style.fontSize);
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const available = heading.clientWidth - padding;
        if (available <= 0) continue;
        // Measure the actual container, including icons, rather than scaling with viewport width.
        for (let attempt = 0; attempt < 5 && heading.scrollWidth > heading.clientWidth + 1; attempt++) {
          const current = parseFloat(getComputedStyle(heading).fontSize);
          const next = current * available / Math.max(available + 1, heading.scrollWidth - padding);
          heading.style.setProperty('font-size', `${Math.min(fontSize, next).toFixed(2)}px`, 'important');
        }
      }
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    void document.fonts.ready.then(schedule);
    fit();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts.removeEventListener('loadingdone', schedule);
      for (const [heading] of originals) restore(heading);
    };
  }, []);
  return null;
}
