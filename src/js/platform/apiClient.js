const BOOKSHELF_URL = '/api/bookshelf';
const BOOK_URL = '/api/book';
const BOOK_COVER_URL = '/api/book-cover';
const UPLOAD_URL = '/api/upload';
const SAVE_CONFIG_URL = '/api/save-config';
const CONFIG_LIST_URL = '/api/config-list';
const FONTS_URL = '/api/fonts';
const FONT_UPLOAD_URL = '/api/fonts/upload';

export function detectApiMode(globalObj = globalThis) {
  return globalObj?.__TAURI__?.core?.invoke ? 'tauri' : 'http';
}

async function readHttpError(response, fallbackMessage) {
  const data = await response.json().catch(() => null);
  return data?.error || fallbackMessage;
}

async function expectOk(response, fallbackMessage) {
  if (response.ok) return response;
  throw new Error(await readHttpError(response, fallbackMessage));
}

function bytesToArrayBuffer(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

function readFileAsArrayBuffer(file) {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

async function fileToCommandPayload(file) {
  const buffer = await readFileAsArrayBuffer(file);
  return {
    name: file.name,
    data: Array.from(new Uint8Array(buffer))
  };
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < view.length; i += chunkSize) {
    const chunk = view.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function createHttpApi({ fetchImpl = fetch, baseUrl = '' } = {}) {
  const url = (path) => `${baseUrl}${path}`;

  return {
    mode: 'http',

    async listBooks() {
      const response = await expectOk(await fetchImpl(url(BOOKSHELF_URL)), '无法加载书架');
      return response.json();
    },

    async getBookCover(path) {
      const response = await expectOk(
        await fetchImpl(url(`${BOOK_COVER_URL}?path=${encodeURIComponent(path)}`)),
        '封面提取失败'
      );
      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType.startsWith('image/')) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
      const data = await response.json();
      return data?.cover || null;
    },

    async readBook(path) {
      const response = await expectOk(
        await fetchImpl(url(`${BOOK_URL}?path=${encodeURIComponent(path)}`)),
        '读取书籍失败'
      );
      return response.arrayBuffer();
    },

    async uploadBooks(files) {
      const formData = new FormData();
      Array.from(files || []).forEach(file => formData.append('books', file));
      const response = await expectOk(
        await fetchImpl(url(UPLOAD_URL), { method: 'POST', body: formData }),
        '上传失败'
      );
      return response.json();
    },

    async deleteBook(path) {
      const response = await expectOk(
        await fetchImpl(url(`${BOOK_URL}?path=${encodeURIComponent(path)}`), { method: 'DELETE' }),
        '删除失败'
      );
      return response.json();
    },

    async saveConfig(config, filename = null) {
      const response = await expectOk(
        await fetchImpl(url(SAVE_CONFIG_URL), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, filename })
        }),
        '保存配置失败'
      );
      return response.json();
    },

    async loadConfig(filename) {
      const response = await expectOk(
        await fetchImpl(url(`/api/load-config/${encodeURIComponent(filename)}`)),
        '加载配置失败'
      );
      return response.json();
    },

    async listConfigs() {
      const response = await expectOk(await fetchImpl(url(CONFIG_LIST_URL)), '获取配置列表失败');
      const result = await response.json();
      return result.configs || [];
    },

    async deleteConfig(filename) {
      const response = await expectOk(
        await fetchImpl(url(`/api/config/${encodeURIComponent(filename)}`), { method: 'DELETE' }),
        '删除配置失败'
      );
      return response.json();
    },

    downloadConfig(filename) {
      const link = document.createElement('a');
      link.href = url(`/api/download-config/${encodeURIComponent(filename)}`);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    async listFonts() {
      const response = await expectOk(await fetchImpl(url(FONTS_URL)), '获取字体列表失败');
      return response.json();
    },

    async uploadFont(file) {
      const formData = new FormData();
      formData.append('font', file);
      const response = await expectOk(
        await fetchImpl(url(FONT_UPLOAD_URL), { method: 'POST', body: formData }),
        '上传字体失败'
      );
      return response.json();
    },

    async deleteFont(fontId) {
      const response = await expectOk(
        await fetchImpl(url(`${FONTS_URL}/${encodeURIComponent(fontId)}`), { method: 'DELETE' }),
        '删除字体失败'
      );
      return response.json();
    },

    async getFontUrl(fontId) {
      return url(`${FONTS_URL}/file/${encodeURIComponent(fontId)}`);
    }
  };
}

export function createTauriApi({ invoke } = {}) {
  if (!invoke) {
    throw new Error('Tauri invoke API is not available');
  }

  return {
    mode: 'tauri',

    listBooks() {
      return invoke('list_books');
    },

    async getBookCover(path) {
      const result = await invoke('get_book_cover', { path });
      return result?.cover || null;
    },

    async readBook(path) {
      const bytes = await invoke('read_book', { path });
      return bytesToArrayBuffer(bytes);
    },

    async uploadBooks(files) {
      const payloads = await Promise.all(Array.from(files || []).map(fileToCommandPayload));
      return invoke('import_books', { files: payloads });
    },

    deleteBook(path) {
      return invoke('delete_book', { path });
    },

    saveConfig(config, filename = null) {
      return invoke('save_config', { config, filename });
    },

    loadConfig(filename) {
      return invoke('load_config', { filename });
    },

    async listConfigs() {
      const result = await invoke('list_configs');
      return result?.configs || [];
    },

    deleteConfig(filename) {
      return invoke('delete_config', { filename });
    },

    async downloadConfig(filename) {
      const result = await invoke('load_config', { filename });
      triggerDownload(filename, JSON.stringify(result.config, null, 2));
    },

    listFonts() {
      return invoke('list_fonts');
    },

    async uploadFont(file) {
      const payload = await fileToCommandPayload(file);
      return invoke('import_font', { file: payload });
    },

    deleteFont(fontId) {
      return invoke('delete_font', { fontId });
    },

    async getFontUrl(fontId) {
      const result = await invoke('read_font', { fontId });
      return `data:${result.mimeType};base64,${bytesToBase64(result.data)}`;
    },

    openBooksFolder() {
      return invoke('open_books_folder');
    }
  };
}

export function createApiClient(globalObj = globalThis) {
  if (detectApiMode(globalObj) === 'tauri') {
    return createTauriApi({ invoke: globalObj.__TAURI__.core.invoke });
  }
  return createHttpApi({ fetchImpl: globalObj.fetch?.bind(globalObj) || fetch });
}

export const apiClient = createApiClient();
