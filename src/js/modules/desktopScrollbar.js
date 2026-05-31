import { desktopBridge } from '../platform/desktopBridge.js';

export function initDesktopScrollbarState() {
  if (!desktopBridge.isDesktop) return;

  const roots = [document.documentElement, document.body];
  let hideTimer = null;

  const setActive = () => {
    roots.forEach(node => node.classList.add('desktop-scroll-active'));
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(() => {
      roots.forEach(node => node.classList.remove('desktop-scroll-active'));
    }, 1000);
  };

  document.addEventListener('scroll', setActive, { passive: true, capture: true });
  window.addEventListener('beforeunload', () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
  }, { once: true });
}
