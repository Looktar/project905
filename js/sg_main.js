// 万锦群英传 on its own page (sg.html, v2.2, D-128): no toy town behind it. Loads the Markham map for the ink
// base map, shows the title screen, and hands over to js/sg_ui.js.
import { layout } from './input.js';
import { t, setLang, getLang, extend } from './i18n.js';
import * as sfx from './audio.js';
import { Sanguo } from './sg_ui.js';

const $ = (id) => document.getElementById(id);
const STAMP = new URL(import.meta.url).searchParams.get('v');
const app = $('app'), home = $('sgHome');
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private mode */ } return null; };

// language: this game's own choice, else the toy town's (same browser), else the browser's
let lang = store('p905sglang');
if (!lang) { try { lang = (JSON.parse(store('p905') || '{}')).lang; } catch (e) { lang = null; } }
setLang(lang === 'en' || lang === 'zh' ? lang : getLang());
extend({ sgBack: '回到标题画面', sgHomeS: '在真实的万锦地图上，带着历代名将一统天下', sgHomeGo: '继续', sgHomeNew: '新的一局', sgHomeStart: '开始', sgHomeLoad: '载入地图…', sgHomeFail: '地图没载入成功，点这里重试', sgHomeLang: 'English' },
  { sgBack: 'Back to the title', sgHomeS: 'Unite the real Markham with heroes from every dynasty', sgHomeGo: 'Continue', sgHomeNew: 'New game', sgHomeStart: 'Start', sgHomeLoad: 'Loading the map…', sgHomeFail: 'The map did not load: tap to retry', sgHomeLang: '中文' });

let W = 0, H = 0, world = null, game = null, failed = false;
const hasSave = () => { try { const s = JSON.parse(store('p905sg') || 'null'); return !!s && !s.over; } catch (e) { return false; } };
function texts() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  document.title = t('sgTitle');
  $('sgHomeT').textContent = t('sgTitle'); $('sgHomeS').textContent = t('sgHomeS');
  $('sgHomeGo').textContent = failed ? t('sgHomeFail') : !world ? t('sgHomeLoad') : hasSave() ? t('sgHomeGo') : t('sgHomeStart');
  $('sgHomeNew').textContent = t('sgHomeNew'); $('sgHomeNew').style.display = world && hasSave() ? '' : 'none';
  $('sgHomeLang').textContent = t('sgHomeLang'); $('sgHomeHelp').textContent = t('sgHelp');
}
function resize() {
  [W, H] = layout(app);
  $('sg').classList.toggle('small', Math.min(W, H) < 500);
  if (game && game.s && home.hidden) game.resize(W, H);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

function showHome() { sfx.bgm(false); home.hidden = false; texts(); }
game = new Sanguo(showHome);
game.standalone = true;
const open0 = game.open.bind(game);
game.open = (...a) => { home.hidden = true; open0(...a); };
window.__sg = game;

async function load() {
  failed = false; texts();
  try {
    const res = await fetch('maps/markham.json' + (STAMP ? '?v=' + STAMP : ''));
    if (!res.ok) throw new Error('map ' + res.status);
    const map = await res.json();
    world = { map, half: map.half };
  } catch (e) { console.error(e); failed = true; }
  $('sgHomeGo').disabled = false; $('sgHomeNew').disabled = !world;
  texts();
}
$('sgHomeGo').addEventListener('click', () => {
  if (failed) { $('sgHomeGo').disabled = true; load(); return; }
  if (!world) return;
  sfx.unlock(); sfx.setMuted(false);
  game.open(world, W, H);
});
$('sgHomeNew').addEventListener('click', () => {
  if (!world) return;
  sfx.unlock(); sfx.setMuted(false);
  game.w = world; game.W = W; game.H = H;
  game.newGame(true);
});
$('sgHomeLang').addEventListener('click', () => { const l = getLang() === 'zh' ? 'en' : 'zh'; setLang(l); store('p905sglang', l); texts(); });
$('sgHomeHelp').addEventListener('click', () => game.help());

resize(); texts(); load();
