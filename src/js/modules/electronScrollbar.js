export function initElectronScrollbarState() {
  if (!(window.electronAPI && window.electronAPI.isElectron)) return;

  const roots = [document.documentElement, document.body];
  let hideTimer = null;

  const setActive = () => {
    roots.forEach(node => node.classList.add('electron-scroll-active'));
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(() => {
      roots.forEach(node => node.classList.remove('electron-scroll-active'));
    }, 1000);
  };

  document.addEventListener('scroll', setActive, { passive: true, capture: true });
  window.addEventListener('beforeunload', () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
  }, { once: true });
}
