import { CONFIG, getFileKey } from '../core/config.js';

const LEGACY_BOOKMARK_PREFIX = 'bookmarks_';

function safeParseObject(raw) {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeParseArray(raw) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeBookmarkStorageKey(key = '') {
  const normalized = String(key || '');
  if (!normalized) return '';
  return normalized.startsWith('server_reader_') ? normalized : getFileKey(normalized);
}

function listLegacyBookmarkKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LEGACY_BOOKMARK_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

function removeLegacyBookmarkKeys() {
  listLegacyBookmarkKeys().forEach((key) => localStorage.removeItem(key));
}

export function getStoredBookmarkMap() {
  const canonical = safeParseObject(localStorage.getItem(CONFIG.STORAGE_KEYS.BOOKMARKS));
  const merged = { ...canonical };

  listLegacyBookmarkKeys().forEach((legacyKey) => {
    const parsed = safeParseArray(localStorage.getItem(legacyKey));
    if (!Array.isArray(parsed)) return;

    const bookPath = legacyKey.slice(LEGACY_BOOKMARK_PREFIX.length);
    const storageKey = getFileKey(bookPath);
    if (!Object.prototype.hasOwnProperty.call(merged, storageKey)) {
      merged[storageKey] = parsed;
    }
  });

  return merged;
}

export function getBookmarksForStorageKey(storageKey) {
  if (!storageKey) return [];
  const bookmarkMap = getStoredBookmarkMap();
  return bookmarkMap[normalizeBookmarkStorageKey(storageKey)] || [];
}

export function normalizeImportedBookmarkMap(bookmarkMap = {}) {
  const normalized = {};

  if (!bookmarkMap || typeof bookmarkMap !== 'object') {
    return normalized;
  }

  Object.entries(bookmarkMap).forEach(([key, bookmarks]) => {
    const storageKey = normalizeBookmarkStorageKey(key);
    if (!storageKey || !Array.isArray(bookmarks)) return;
    normalized[storageKey] = bookmarks;
  });

  return normalized;
}

export function persistBookmarkMap(bookmarkMap = {}) {
  const normalized = normalizeImportedBookmarkMap(bookmarkMap);
  localStorage.setItem(CONFIG.STORAGE_KEYS.BOOKMARKS, JSON.stringify(normalized));
  removeLegacyBookmarkKeys();
  return normalized;
}
