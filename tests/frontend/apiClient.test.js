// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createHttpApi, createTauriApi, detectApiMode } from '../../src/js/platform/apiClient.js';

describe('apiClient adapters', () => {
  it('HTTP adapter lists books through the existing Express endpoint', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe('/api/bookshelf');
      return {
        ok: true,
        json: async () => [{ name: 'demo.txt', path: 'demo.txt' }]
      };
    });

    const api = createHttpApi({ fetchImpl });
    await expect(api.listBooks()).resolves.toEqual([{ name: 'demo.txt', path: 'demo.txt' }]);
  });

  it('HTTP adapter reads a book as an ArrayBuffer from the compatible API URL', async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe('/api/book?path=folder%2Fdemo.epub');
      return {
        ok: true,
        arrayBuffer: async () => buffer
      };
    });

    const api = createHttpApi({ fetchImpl });
    const result = await api.readBook('folder/demo.epub');

    expect(result).toBe(buffer);
  });

  it('Tauri adapter maps command byte arrays to ArrayBuffer results', async () => {
    const invoke = vi.fn(async (command, payload) => {
      expect(command).toBe('read_book');
      expect(payload).toEqual({ path: 'demo.pdf' });
      return [37, 80, 68, 70];
    });

    const api = createTauriApi({ invoke });
    const result = await api.readBook('demo.pdf');

    expect(Array.from(new Uint8Array(result))).toEqual([37, 80, 68, 70]);
  });

  it('Tauri adapter serializes uploaded File objects for Rust commands', async () => {
    const file = new File([new Uint8Array([65, 66])], 'demo.txt', { type: 'text/plain' });
    const invoke = vi.fn(async (command, payload) => {
      expect(command).toBe('import_books');
      expect(payload.files).toEqual([{ name: 'demo.txt', data: [65, 66] }]);
      return { success: true, files: [{ originalName: 'demo.txt', savedName: 'demo.txt', size: 2 }] };
    });

    const api = createTauriApi({ invoke });
    await expect(api.uploadBooks([file])).resolves.toMatchObject({ success: true });
  });

  it('detects Tauri mode only when the Tauri invoke API is present', () => {
    expect(detectApiMode({})).toBe('http');
    expect(detectApiMode({ __TAURI__: { core: { invoke: vi.fn() } } })).toBe('tauri');
  });
});
