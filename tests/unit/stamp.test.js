// The cache-busting stamp in index.html must match the current code + map (tools/stamp.mjs, D-61).
import { describe, it, expect } from 'vitest';
import { currentBlock, stampBlock, stampHash, PAGES } from '../../tools/stamp.mjs';

describe('version stamp', () => {
  it('index.html stamp is up to date (run `npm run stamp`)', () => {
    expect(currentBlock()).toBe(stampBlock());
  });
  it('every page with a stamp is up to date (v2.2: sg.html too)', () => {
    for (const [page, [entry, css]] of Object.entries(PAGES)) expect(currentBlock(page), page).toBe(stampBlock(stampHash(), entry, css));
  });
  it('every game module is in the import map', () => {
    const b = stampBlock();
    for (const m of ['main', 'world', 'game', 'renderer', 'config']) expect(b).toContain(`"./js/${m}.js":"./js/${m}.js?v=`);
  });
});
