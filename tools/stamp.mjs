// Cache-busting stamp for the zero-build game (D-61).
//
// GitHub Pages serves every file with `Cache-Control: max-age=600` and ES module imports carry no
// version, so a player who opens the game right after a deploy can get some modules new and some
// old. index.html therefore carries an import map that points every js/*.js at `?v=<hash>`, where
// the hash covers all game code and the map. main.js reads the same hash from its own URL for the
// map fetch.
//
//   npm run stamp          rewrite the stamp in index.html (run after changing js/ or maps/)
//   tests/unit/stamp.test.js fails while the stamp is stale
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX = ROOT + 'index.html';
const BEGIN = '<!-- stamp:begin (npm run stamp) -->', END = '<!-- stamp:end -->';

export const modules = () => readdirSync(ROOT + 'js').filter((f) => f.endsWith('.js')).sort();

// content hash (line endings normalised: Windows checkouts use CRLF, CI uses LF)
export function stampHash() {
  const h = createHash('sha256');
  for (const f of [...modules().map((m) => 'js/' + m), 'maps/markham.json', 'css/sg.css'])
    h.update(f + '\0' + readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n') + '\0');
  return h.digest('hex').slice(0, 10);
}

// the pages that carry a stamp, and the module each one starts (v2.2: 万锦群英传 has its own page, sg.html)
export const PAGES = { 'index.html': ['main.js'], 'sg.html': ['sg_main.js', 'css/sg.css'] };
export function stampBlock(v = stampHash(), entry = 'main.js', css = null) {
  const imports = Object.fromEntries(modules().map((m) => ['./js/' + m, './js/' + m + '?v=' + v]));
  return [
    BEGIN,
    ...(css ? ['<link rel="stylesheet" href="' + css + '?v=' + v + '">'] : []),
    '<script type="importmap">' + JSON.stringify({ imports }) + '</script>',
    '<script type="module" src="js/' + entry + '?v=' + v + '"></script>',
    END,
  ].join('\n');
}

// the stamp block currently in index.html (null if missing)
export function currentBlock(html = readFileSync(INDEX, 'utf8')) {
  if (!html.includes('<')) html = readFileSync(ROOT + html, 'utf8'); // a page name
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  return a < 0 || b < 0 ? null : html.slice(a, b + END.length).replace(/\r\n/g, '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let changed = false;
  for (const [page, [entry, css]] of Object.entries(PAGES)) {
    const file = ROOT + page, html = readFileSync(file, 'utf8'), old = currentBlock(html);
    if (!old) throw new Error(page + ' has no stamp block');
    const next = stampBlock(stampHash(), entry, css), eol = html.includes('\r\n') ? '\r\n' : '\n';
    const a = html.indexOf(BEGIN), b = html.indexOf(END) + END.length;
    writeFileSync(file, html.slice(0, a) + next.replace(/\n/g, eol) + html.slice(b));
    changed = changed || old !== next;
  }
  console.log(changed ? 'stamp: ' + stampHash() : 'stamp: unchanged');
}
