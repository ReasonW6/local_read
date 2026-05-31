function getInvoke(globalObj = globalThis) {
  return globalObj?.__TAURI__?.core?.invoke || null;
}

function getMaximizeIcon(isMaximized) {
  return isMaximized
    ? '<svg viewBox="0 0 10 10"><rect x="2.5" y="0" width="7" height="7" stroke="currentColor" fill="none"/><rect x="0" y="2.5" width="7" height="7" stroke="currentColor" fill="var(--toolbar-bg, var(--qd-white, #fff))"/></svg>'
    : '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" fill="none"/></svg>';
}

export const desktopBridge = {
  get isDesktop() {
    return Boolean(getInvoke());
  },

  async openBooksFolder() {
    const invoke = getInvoke();
    if (!invoke) return null;
    return invoke('open_books_folder');
  },

  async windowMinimize() {
    const invoke = getInvoke();
    if (!invoke) return null;
    return invoke('window_minimize');
  },

  async windowMaximize() {
    const invoke = getInvoke();
    if (!invoke) return false;
    return invoke('window_maximize_toggle');
  },

  async windowClose() {
    const invoke = getInvoke();
    if (!invoke) return null;
    return invoke('window_close');
  },

  async windowIsMaximized() {
    const invoke = getInvoke();
    if (!invoke) return false;
    return invoke('window_is_maximized');
  },

  onMaximizeChange(callback) {
    if (!this.isDesktop) return;
    let lastValue = null;
    let timer = null;

    const check = async () => {
      try {
        const isMaximized = await this.windowIsMaximized();
        if (isMaximized !== lastValue) {
          lastValue = isMaximized;
          callback(isMaximized);
        }
      } catch {
        // Window state is cosmetic; avoid surfacing noisy titlebar errors.
      }
    };

    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(check, 80);
    });
    check();
  }
};

export function initDesktopTitlebar(pageClass) {
  if (!desktopBridge.isDesktop) return;

  document.documentElement.classList.add('desktop-app', pageClass);
  document.body.classList.add('desktop-app', pageClass);

  const titlebar = document.getElementById('titlebar');
  const minBtn = document.getElementById('titlebar-min');
  const maxBtn = document.getElementById('titlebar-max');
  const closeBtn = document.getElementById('titlebar-close');
  if (titlebar) titlebar.style.display = '';

  if (minBtn) minBtn.onclick = () => desktopBridge.windowMinimize();
  if (maxBtn) maxBtn.onclick = async () => {
    const isMaximized = await desktopBridge.windowMaximize();
    maxBtn.title = isMaximized ? '还原' : '最大化';
    maxBtn.innerHTML = getMaximizeIcon(isMaximized);
  };
  if (closeBtn) closeBtn.onclick = () => desktopBridge.windowClose();

  desktopBridge.onMaximizeChange((isMaximized) => {
    if (!maxBtn) return;
    maxBtn.title = isMaximized ? '还原' : '最大化';
    maxBtn.innerHTML = getMaximizeIcon(isMaximized);
  });
}
