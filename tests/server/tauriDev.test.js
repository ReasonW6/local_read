import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

describe('Tauri desktop dev startup configuration', () => {
  it('starts a static frontend server for the configured Tauri dev URL', () => {
    const tauriConfig = readJson('src-tauri/tauri.conf.json');
    const packageJson = readJson('package.json');

    expect(tauriConfig.build.devUrl).toBe('http://127.0.0.1:1450');
    expect(tauriConfig.build.beforeDevCommand).toBe('npm run tauri:serve');
    expect(packageJson.scripts['tauri:serve']).toBe('node scripts/tauri-dev-server.js');
  });

  it('keeps desktop CSS selectors aligned with the classes added by JavaScript', () => {
    const css = fs.readFileSync(path.join(root, 'src/css/titlebar.css'), 'utf8');

    expect(css).toContain('html.desktop-app');
    expect(css).toContain('body.desktop-app');
    expect(css).toContain('html.desktop-scroll-active');
    expect(css).not.toContain('桌面端-app');
    expect(css).not.toContain('桌面端-scroll');
  });
});
