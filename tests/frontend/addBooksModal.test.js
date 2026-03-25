// 添加书籍弹窗安全渲染测试
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function setupDom() {
    document.body.innerHTML = `
      <div id="addBooksMask"></div>
      <button id="addBooksClose"></button>
      <div id="dropZone"></div>
      <button id="selectFilesBtn"></button>
      <input id="fileInputModal" type="file" />
      <button id="clearFilesBtn"></button>
      <button id="cancelAddBtn"></button>
      <button id="confirmAddBtn">
        <span class="btn-text">添加书籍</span>
        <span class="btn-loading" style="display:none;">上传中</span>
      </button>
      <div id="filesList"></div>
    `;
}

async function loadModule() {
    vi.resetModules();
    return import('../../src/js/modules/addBooksModal.js');
}

beforeEach(() => {
    setupDom();
    vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('addBooksModal', () => {
    it('应将文件名作为文本渲染，而不是直接注入 HTML', async () => {
        const modal = await loadModule();
        modal.initAddBooksModal(async () => {});

        const input = document.getElementById('fileInputModal');
        const maliciousName = '\"><img src=x onerror=alert(1)>.txt';
        const file = new File(['demo'], maliciousName, { type: 'text/plain' });

        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [file]
        });

        input.dispatchEvent(new Event('change'));

        const filesList = document.getElementById('filesList');
        const fileNameEl = filesList.querySelector('.file-name');

        expect(fileNameEl).not.toBeNull();
        expect(fileNameEl.textContent).toBe(maliciousName);
        expect(fileNameEl.getAttribute('title')).toBe(maliciousName);
        expect(filesList.querySelectorAll('img')).toHaveLength(0);
    });
});
