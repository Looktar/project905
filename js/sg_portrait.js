// 万锦群英传 v1.3 (D-109): a chibi portrait for every officer, drawn by code (no artwork, no cost).
// Big round head, small body; armour or robe in the officer's colours, headgear by era and role, beard, face and a
// signature weapon. Most of it is worked out from the data (era, stats, side); the famous ones get their own look
// (关羽's red face, green scarf and glaive, 吕布's pheasant feathers and halberd, 诸葛亮's scarf and feather fan...).
// portraitURL(id) returns a cached PNG data URL; drawPortrait(ctx, look, size) draws one.

import { GENERALS } from './sg_data.js';

const INK = '#2b211a';
const SKIN = { fair: '#f7d7b8', light: '#f1c9a2', tan: '#d9a577', brown: '#b98058', red: '#c8503e', dark: '#7a5236', black: '#4f3426', mongol: '#e6b98c' };
const KC = { shu: '#2f8f4e', wei: '#2f5fae', wu: '#c0392b', qun: '#6b4f8a', xq: '#8a6d3b', qh: '#a8552a', st: '#b8860b', sy: '#2e7d7a', mq: '#b03a5b' };
const WOMEN = new Set(['diaochan', 'zhurong', 'fuhao', 'pingyang', 'lianghongyu', 'qinliangyu']);
const YOUNG = new Set(['zhaoyun', 'machao', 'sunce', 'zhouyu', 'luxun', 'huoqubing', 'xuerengui', 'jiangwei', 'lvbu', 'guojia', 'gaochanggong', 'lishimin', 'zhengchenggong', 'chenqingzhi', 'xiexuan', 'yangye', 'yuefei', 'pangtong', 'zhanghe']);
const OLD = new Set(['huangzhong', 'lianpo', 'zongze', 'guoziyi', 'wangjian', 'zhangzhao', 'huanggai', 'fanzeng', 'mayuan', 'boyan', 'sunwu']);
const RULERS = new Set(['liubei', 'caocao', 'sunquan', 'liubang', 'lishimin', 'yuanshao', 'dongzhuo', 'sunjian']);
const QING = new Set(['shilang', 'niangengyao', 'yuezhongqi', 'zhaohui', 'fukangan']);

// hand-made looks for the famous; anything left out is filled in by lookOf()
const OVR = {
  guanyu: { skin: 'red', beard: 'long', hat: 'scarf', hatCol: '#2f8f4e', weapon: 'glaive', robe: '#2f8f4e', armor: true, brow: 'fierce', eyes: 'narrow' },
  zhangfei: { skin: 'dark', beard: 'whisker', hat: 'helmet', metal: '#3a3f47', weapon: 'snake', brow: 'angry', eyes: 'round' },
  liubei: { beard: 'goatee', hat: 'crown', weapon: 'twin', armor: false, brow: 'kind' },
  zhugeliang: { beard: 'goatee', hat: 'lunjin', hatCol: '#5d7f99', weapon: 'fan', robe: '#e9e4d6', brow: 'calm', eyes: 'narrow' },
  zhaoyun: { hat: 'plume', metal: '#e3e8ee', plume: '#f4f6fb', weapon: 'spear', brow: 'brave' },
  machao: { hat: 'lion', metal: '#e3e8ee', plume: '#ffffff', weapon: 'spear', brow: 'brave' },
  huangzhong: { beard: 'long', beardCol: '#e9e6df', hat: 'helmet', weapon: 'bow', brow: 'fierce' },
  lvbu: { hat: 'pheasant', weapon: 'halberd', metal: '#d4a72c', robe: '#6b2fa0', brow: 'angry' },
  caocao: { beard: 'goatee', hat: 'crown', weapon: 'sword', robe: '#2f3a5e', brow: 'sly', eyes: 'narrow' },
  simayi: { beard: 'goatee', hat: 'guan', weapon: 'scroll', brow: 'sly', eyes: 'narrow' },
  xiahoudun: { beard: 'short', patch: true, hat: 'helmet', weapon: 'spear', brow: 'angry' },
  dianwei: { skin: 'dark', beard: 'whisker', hat: 'band', hatCol: '#a33', weapon: 'twinhalb', brow: 'angry' },
  xuchu: { skin: 'tan', beard: 'short', hat: 'bald', weapon: 'mace', brow: 'angry', eyes: 'round' },
  zhangliao: { beard: 'mustache', hat: 'helmet', weapon: 'glaive2', brow: 'fierce' },
  sunquan: { beard: 'goatee', beardCol: '#7a3fa0', eye: '#2f9e8f', hat: 'crown', weapon: 'sword', brow: 'calm' },
  sunce: { hat: 'plume', weapon: 'spear', brow: 'brave' },
  zhouyu: { hat: 'guan', weapon: 'qin', robe: '#c0392b', brow: 'calm' },
  ganning: { hat: 'band', hatCol: '#c0392b', weapon: 'saber', brow: 'brave', bell: true },
  taishici: { hat: 'helmet', weapon: 'bow', brow: 'brave' },
  diaochan: { hat: 'bun', hatCol: '#e7a1c0', weapon: 'fanw', robe: '#e78fb3' },
  zhurong: { skin: 'tan', hat: 'feathers', weapon: 'knives', robe: '#c0392b', brow: 'brave' },
  menghuo: { skin: 'brown', beard: 'whisker', hat: 'feathers', weapon: 'axe', brow: 'angry' },
  zhangjiao: { beard: 'long', beardCol: '#cfc8bb', hat: 'yellow', weapon: 'staff', robe: '#d9a72c', brow: 'sly' },
  dongzhuo: { skin: 'light', beard: 'whisker', hat: 'crown', weapon: 'sword', robe: '#4a3a2a', brow: 'sly', fat: true },
  xiangyu: { hat: 'plume', metal: '#3a3f47', plume: '#c0392b', weapon: 'halberd', beard: 'short', brow: 'angry' },
  hanxin: { hat: 'helmet', weapon: 'flag', brow: 'calm' },
  zhangliang: { hat: 'guan', weapon: 'scroll', brow: 'calm', eyes: 'narrow' },
  liguang: { hat: 'helmet', weapon: 'bow', beard: 'short' },
  huoqubing: { hat: 'plume', weapon: 'spear', plume: '#c0392b' },
  yuchigong: { skin: 'black', beard: 'whisker', hat: 'helmet', weapon: 'whip', brow: 'angry' },
  qinqiong: { beard: 'short', hat: 'helmet', weapon: 'mace', metal: '#d4a72c' },
  chengyaojin: { beard: 'whisker', hat: 'helmet', weapon: 'axe', brow: 'happy', eyes: 'round' },
  xuerengui: { hat: 'plume', metal: '#e3e8ee', plume: '#f4f6fb', robe: '#f4f6fb', weapon: 'bow' },
  yuefei: { hat: 'plume', weapon: 'spear', brow: 'brave', beard: 'mustache' },
  yangye: { beard: 'short', hat: 'plume', weapon: 'spear' },
  chengjisihan: { skin: 'mongol', beard: 'goatee', hat: 'mongol', hatCol: '#c0392b', weapon: 'bow', brow: 'fierce' },
  muhuali: { skin: 'mongol', beard: 'mustache', hat: 'mongol', weapon: 'saber' },
  subutai: { skin: 'mongol', beard: 'short', hat: 'mongol', weapon: 'saber', patch: true },
  boyan: { skin: 'mongol', beard: 'goatee', hat: 'mongol', weapon: 'scroll' },
  jinwuzhu: { skin: 'mongol', beard: 'mustache', hat: 'fur', weapon: 'mace' },
  qijiguang: { hat: 'ming', weapon: 'sword', beard: 'mustache' },
  zhengchenggong: { hat: 'ming', weapon: 'sword' },
  wangyangming: { hat: 'wusha', weapon: 'book', beard: 'goatee', eyes: 'narrow' },
  yuqian: { hat: 'wusha', weapon: 'scroll', beard: 'goatee' },
  gaochanggong: { hat: 'mask', weapon: 'spear', metal: '#d4a72c' },
  lishimin: { beard: 'mustache', hat: 'futou', weapon: 'bow', armor: true },
  pingyang: { hat: 'femhelm', weapon: 'spear', plume: '#e78fb3' },
  lianghongyu: { hat: 'femhelm', weapon: 'drum', plume: '#c0392b' },
  qinliangyu: { hat: 'femhelm', weapon: 'spear', plume: '#ffffff' },
  fuhao: { hat: 'femhelm', weapon: 'axe', metal: '#b07a3a', plume: '#2f8f4e' },
  sunwu: { hat: 'guan', weapon: 'bamboo', beard: 'long', beardCol: '#e9e6df' },
  sunbin: { hat: 'guan', weapon: 'bamboo', beard: 'goatee', eyes: 'narrow' },
  banchao: { hat: 'helmet', weapon: 'brush' },
  xiaohe: { hat: 'guan', weapon: 'abacus', beard: 'goatee' },
  pangtong: { hat: 'guan', weapon: 'fan', beard: 'short' },
  baiqi: { hat: 'helmet', metal: '#3a3f47', weapon: 'sword', brow: 'angry', eyes: 'narrow' },
};

// a look from the data, with the hand-made parts on top
export function lookOf(id) {
  const g = GENERALS[id], b = g.base || g, o = OVR[id] || {};
  const woman = WOMEN.has(id), young = YOUNG.has(id) || woman, old = OLD.has(id);
  const armor = o.armor ?? (b.war >= b.int + 5 || b.war >= 82);
  const era = g.era, side = g.k;
  let hat;
  if (QING.has(id)) hat = 'qing';
  else if (RULERS.has(id)) hat = 'crown';
  else if (armor) hat = era === 'mq' ? 'ming' : woman ? 'femhelm' : (b.war >= 90 ? 'plume' : 'helmet');
  else hat = era === 'sy' || era === 'mq' ? 'wusha' : era === 'st' ? 'futou' : woman ? 'bun' : 'guan';
  // a stable per-officer dice, so the many plain helmets do not all look alike
  let hsh = 7; for (const ch of id) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = (arr, salt) => arr[(((hsh >>> salt) ^ Math.imul(hsh, salt + 3)) >>> 0) % arr.length];
  const weapon = armor ? (b.war >= 92 ? pick(['spear', 'glaive2', 'spear'], 2) : pick(['sword', 'spear', 'saber', 'glaive2', 'sword'], 3))
    : era === 'xq' || era === 'qh' ? pick(['bamboo', 'scroll', 'fan2'], 4) : pick(['fan2', 'scroll', 'book', 'brush'], 4);
  const beard = woman || young ? 'none' : old ? 'long' : armor ? pick(['short', 'mustache', 'goatee', 'short', 'none'], 5) : pick(['goatee', 'goatee', 'mustache', 'long'], 6);
  const metalV = pick(['#9aa5b1', '#b8925a', '#6d7884', '#9aa5b1', '#c9b28a'], 7), plumeV = pick(['#d23b2f', '#d23b2f', '#2f5fae', '#e8b923', '#f4f6fb'], 8);
  return {
    id, woman, armor, hat, weapon, beard,
    skin: SKIN[o.skin || (woman ? 'fair' : 'light')],
    beardCol: old && !o.beardCol ? '#e3dfd6' : o.beardCol || '#2b2320',
    side: KC[side] || '#8a6d3b', robe: o.robe || KC[side] || '#8a6d3b',
    metal: o.metal || (b.war >= 95 ? '#d4a72c' : metalV),
    hatCol: o.hatCol || (hat === 'qing' ? '#3b2f2a' : hat === 'bun' ? '#2b2320' : KC[side]),
    plume: o.plume || plumeV, brow: o.brow || (armor ? (b.war >= 90 ? 'fierce' : pick(['brave', 'brave', 'fierce', 'calm'], 9)) : pick(['calm', 'calm', 'kind', 'sly'], 10)),
    eyes: o.eyes || (woman ? 'lash' : pick(['dot', 'dot', 'narrow', 'round', 'dot'], 11)), eye: o.eye || null,
    ...Object.fromEntries(Object.entries(o).filter(([k]) => !['skin'].includes(k))),
    skinKey: o.skin || (woman ? 'fair' : 'light'),
  };
}

// ---------------------------------------------------------------- drawing (in a 128 x 128 box)
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), ch = (v) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function drawPortrait(c, L, size = 128) {
  c.save(); c.scale(size / 128, size / 128);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const out = (lw = 2.6) => { c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); };
  const fillOut = (col, lw) => { c.fillStyle = col; c.fill(); out(lw); };
  const P = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  const E = (x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
  const HX = 64, HY = 58, HR = 33;

  // ---- long hair behind everything (the body covers its lower part, so it never shows under the chin)
  if (L.woman) { c.beginPath(); c.moveTo(HX - HR - 2, HY - 6); c.quadraticCurveTo(HX - HR - 12, HY + 30, HX - HR + 2, HY + 50); c.lineTo(HX + HR - 2, HY + 50); c.quadraticCurveTo(HX + HR + 12, HY + 30, HX + HR + 2, HY - 6); c.closePath(); fillOut('#2b2320'); }
  // ---- weapon behind the body
  weaponBack(c, L, out, fillOut, P, E);

  // ---- body: shoulders and chest
  const fat = L.fat ? 8 : 0;
  c.beginPath(); c.moveTo(14 - fat, 128); c.quadraticCurveTo(16 - fat, 96, 44, 90); c.lineTo(84, 90); c.quadraticCurveTo(112 + fat, 96, 114 + fat, 128); c.closePath();
  if (L.armor) {
    fillOut(shade(L.robe, 0.85));
    // breastplate and plates
    P([[42, 92], [86, 92], [90, 128], [38, 128]]); fillOut(L.metal);
    c.strokeStyle = shade(L.metal, 0.7); c.lineWidth = 1.6;
    for (const y of [104, 114, 124]) { c.beginPath(); c.moveTo(41, y); c.lineTo(87, y); c.stroke(); }
    E(64, 104, 7, 6); fillOut(shade(L.metal, 1.25), 1.8); // the round mirror on the chest
    // shoulder pads
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(64 + s * 40, 102, 17, 13, s * 0.35, Math.PI, 0); c.closePath(); fillOut(L.metal); c.beginPath(); c.ellipse(64 + s * 40, 103, 12, 6, s * 0.35, 0, Math.PI); c.strokeStyle = shade(L.metal, 0.7); c.lineWidth = 1.5; c.stroke(); }
    // a cape / scarf in the side's colour
    P([[46, 90], [82, 90], [74, 98], [54, 98]]); fillOut(L.side, 2);
  } else {
    fillOut(L.robe);
    // crossed collar (交领) and a sash
    c.beginPath(); c.moveTo(50, 90); c.lineTo(68, 118); c.lineTo(78, 90); c.closePath(); fillOut('#f4efe2', 2);
    c.beginPath(); c.moveTo(78, 90); c.lineTo(58, 118); c.strokeStyle = INK; c.lineWidth = 2.2; c.stroke();
    P([[30, 120], [98, 120], [98, 126], [30, 126]]); fillOut(shade(L.robe, 0.7), 1.8);
    if (L.woman) { c.fillStyle = '#ffd1e0'; for (const x of [40, 88]) { E(x, 108, 4, 4); c.fill(); } }
  }
  // neck
  P([[56, 84], [72, 84], [71, 93], [57, 93]]); fillOut(shade(L.skin, 0.9), 2);

  // ---- hair behind the head (long hair, ponytails)
  if (L.hat === 'femhelm') { c.beginPath(); c.moveTo(HX + 20, HY - 18); c.quadraticCurveTo(HX + 48, HY + 6, HX + 36, HY + 34); c.quadraticCurveTo(HX + 34, HY + 8, HX + 16, HY - 6); c.closePath(); fillOut('#2b2320'); }

  // ---- head
  for (const s of [-1, 1]) { E(HX + s * HR, HY + 4, 6, 8); fillOut(L.skin, 2.2); }
  E(HX, HY, HR, HR * 0.98); fillOut(L.skin, 2.8);
  if (L.fat) { E(HX, HY + 16, HR * 0.9, 12); c.fillStyle = shade(L.skin, 0.94); c.fill(); }

  // ---- hair on top (under most hats)
  if (!['bald', 'mongol', 'fur', 'qing', 'mask'].includes(L.hat)) {
    c.beginPath(); c.moveTo(HX - HR + 1, HY - 2); c.quadraticCurveTo(HX - HR + 2, HY - HR - 4, HX, HY - HR - 2); c.quadraticCurveTo(HX + HR - 2, HY - HR - 4, HX + HR - 1, HY - 2);
    c.quadraticCurveTo(HX + 18, HY - 18, HX + 4, HY - 14); c.quadraticCurveTo(HX - 12, HY - 20, HX - HR + 1, HY - 2); c.closePath();
    fillOut(L.hat === 'yellow' || L.hat === 'band' ? '#2b2320' : '#2b2320', 2.4);
  }
  if (L.hat === 'bald') { c.fillStyle = 'rgba(255,255,255,.45)'; E(HX - 10, HY - 22, 9, 5, -0.4); c.fill(); }

  face(c, L, out, fillOut, P, E, HX, HY, HR);
  hat(c, L, out, fillOut, P, E, HX, HY, HR);

  // ---- weapon / thing in front
  weaponFront(c, L, out, fillOut, P, E);
  c.restore();
}

function face(c, L, out, fillOut, P, E, HX, HY, HR) {
  const ey = HY + 4, ex = 13;
  // brows
  c.strokeStyle = INK; c.lineCap = 'round';
  const brow = (s, a, y, w, lw) => { c.lineWidth = lw; c.beginPath(); c.moveTo(HX + s * (ex - w), y + (s > 0 ? -a : a) * 0 + a); c.lineTo(HX + s * (ex + w), y - a); c.stroke(); };
  const B = L.brow;
  for (const s of [-1, 1]) {
    if (B === 'angry') { c.lineWidth = 4.2; c.beginPath(); c.moveTo(HX + s * 5, ey - 7); c.lineTo(HX + s * 20, ey - 13); c.stroke(); }
    else if (B === 'fierce') { c.lineWidth = 3.6; c.beginPath(); c.moveTo(HX + s * 6, ey - 9); c.lineTo(HX + s * 20, ey - 13); c.stroke(); }
    else if (B === 'brave') { c.lineWidth = 3.2; c.beginPath(); c.moveTo(HX + s * 7, ey - 10); c.lineTo(HX + s * 19, ey - 12); c.stroke(); }
    else if (B === 'sly') { c.lineWidth = 2.6; c.beginPath(); c.moveTo(HX + s * 7, ey - 9); c.quadraticCurveTo(HX + s * 14, ey - 14, HX + s * 20, ey - 10); c.stroke(); }
    else if (B === 'happy' || B === 'kind') { c.lineWidth = 2.6; c.beginPath(); c.moveTo(HX + s * 7, ey - 11); c.quadraticCurveTo(HX + s * 13, ey - 15, HX + s * 19, ey - 11); c.stroke(); }
    else { c.lineWidth = 2.4; c.beginPath(); c.moveTo(HX + s * 8, ey - 11); c.lineTo(HX + s * 19, ey - 12); c.stroke(); }
  }
  void brow;
  // eyes
  for (const s of [-1, 1]) {
    const x = HX + s * ex;
    if (L.patch && s < 0) { E(x, ey, 7, 6); fillOut('#1f1a16', 1.5); c.beginPath(); c.moveTo(x - 12, ey - 9); c.lineTo(x + 10, ey + 8); c.strokeStyle = '#1f1a16'; c.lineWidth = 1.6; c.stroke(); continue; }
    if (L.eyes === 'narrow') { c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 5, ey + 1); c.quadraticCurveTo(x, ey - 2, x + 5, ey + 1); c.stroke(); continue; }
    if (B === 'happy') { c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 5, ey + 1); c.quadraticCurveTo(x, ey - 5, x + 5, ey + 1); c.stroke(); continue; }
    const r = L.eyes === 'round' ? 5.4 : 4.4;
    E(x, ey, r * 0.85, r); c.fillStyle = L.eye || '#1f1a16'; c.fill();
    if (L.eye) { E(x, ey + 1, r * 0.45, r * 0.5); c.fillStyle = '#1f1a16'; c.fill(); }
    c.fillStyle = '#fff'; E(x + 1.6, ey - 1.8, 1.6, 1.6); c.fill();
    if (L.eyes === 'lash') { c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(x + s * 3, ey - 4); c.lineTo(x + s * 7, ey - 6); c.stroke(); }
  }
  // cheeks
  if (L.skinKey !== 'black' && L.skinKey !== 'red') { c.fillStyle = 'rgba(255,120,120,.28)'; for (const s of [-1, 1]) { E(HX + s * 20, ey + 10, 6, 3.5); c.fill(); } }
  // nose
  c.strokeStyle = shade(L.skin, 0.7); c.lineWidth = 2; c.beginPath(); c.moveTo(HX - 1, ey + 7); c.lineTo(HX + 1, ey + 9); c.stroke();
  // mouth (under the beard where there is one)
  const my = HY + 22;
  c.strokeStyle = INK; c.lineWidth = 2.4;
  if (B === 'angry') { c.beginPath(); c.moveTo(HX - 6, my); c.lineTo(HX + 6, my); c.lineTo(HX + 4, my + 4); c.lineTo(HX - 4, my + 4); c.closePath(); c.fillStyle = '#7a2a22'; c.fill(); c.stroke(); }
  else if (B === 'happy' || B === 'kind' || L.woman) { c.beginPath(); c.moveTo(HX - 5, my - 1); c.quadraticCurveTo(HX, my + 4, HX + 5, my - 1); c.stroke(); }
  else if (B === 'sly') { c.beginPath(); c.moveTo(HX - 5, my); c.quadraticCurveTo(HX + 2, my + 2, HX + 6, my - 3); c.stroke(); }
  else { c.beginPath(); c.moveTo(HX - 4, my); c.lineTo(HX + 4, my); c.stroke(); }
  // beard
  const bc = L.beardCol, bd = L.beard;
  if (bd === 'long') {
    c.beginPath(); c.moveTo(HX - 20, HY + 12); c.quadraticCurveTo(HX - 22, HY + 40, HX - 6, HY + 58); c.lineTo(HX, HY + 66); c.lineTo(HX + 6, HY + 58);
    c.quadraticCurveTo(HX + 22, HY + 40, HX + 20, HY + 12); c.quadraticCurveTo(HX + 10, HY + 20, HX, HY + 19); c.quadraticCurveTo(HX - 10, HY + 20, HX - 20, HY + 12); c.closePath();
    fillOut(bc, 2.4);
    c.strokeStyle = shade(bc === '#2b2320' ? '#6b5a4a' : bc, 0.85); c.lineWidth = 1.3;
    for (const x of [-10, -3, 4, 11]) { c.beginPath(); c.moveTo(HX + x, HY + 26); c.quadraticCurveTo(HX + x * 0.8, HY + 42, HX + x * 0.3, HY + 56); c.stroke(); }
    mustache(c, HX, HY + 16, bc, 13);
  } else if (bd === 'whisker') {
    c.beginPath(); c.moveTo(HX - HR + 3, HY + 2);
    const n = 9;
    for (let i = 0; i <= n; i++) { const a = Math.PI * (0.05 + 0.9 * i / n), r1 = HR + 10, r0 = HR - 3; c.lineTo(HX - Math.cos(a) * r1, HY + 6 + Math.sin(a) * r1); if (i < n) { const a2 = Math.PI * (0.05 + 0.9 * (i + 0.5) / n); c.lineTo(HX - Math.cos(a2) * r0, HY + 6 + Math.sin(a2) * r0); } }
    c.lineTo(HX + HR - 3, HY + 2); c.quadraticCurveTo(HX + 14, HY + 12, HX, HY + 16); c.quadraticCurveTo(HX - 14, HY + 12, HX - HR + 3, HY + 2); c.closePath();
    fillOut(bc, 2.2);
    if (L.brow === 'angry') { c.beginPath(); c.moveTo(HX - 6, HY + 22); c.lineTo(HX + 6, HY + 22); c.lineTo(HX + 4, HY + 27); c.lineTo(HX - 4, HY + 27); c.closePath(); c.fillStyle = '#7a2a22'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); }
  } else if (bd === 'short') {
    c.beginPath(); c.moveTo(HX - HR + 4, HY + 6); c.quadraticCurveTo(HX - 24, HY + 34, HX, HY + 36); c.quadraticCurveTo(HX + 24, HY + 34, HX + HR - 4, HY + 6);
    c.quadraticCurveTo(HX + 18, HY + 20, HX, HY + 18); c.quadraticCurveTo(HX - 18, HY + 20, HX - HR + 4, HY + 6); c.closePath();
    fillOut(bc, 2.2);
    mustache(c, HX, HY + 16, bc, 11);
  } else if (bd === 'goatee') {
    c.beginPath(); c.moveTo(HX - 6, HY + 26); c.quadraticCurveTo(HX, HY + 46, HX, HY + 46); c.quadraticCurveTo(HX, HY + 46, HX + 6, HY + 26); c.closePath(); fillOut(bc, 2);
    mustache(c, HX, HY + 17, bc, 10);
  } else if (bd === 'mustache') mustache(c, HX, HY + 17, bc, 11);
}
function mustache(c, x, y, col, w) {
  c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 1.8;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + s * w * 0.6, y - 3, x + s * w, y + 5); c.quadraticCurveTo(x + s * w * 0.5, y + 2, x, y + 3); c.closePath(); c.fill(); c.stroke(); }
}

function hat(c, L, out, fillOut, P, E, HX, HY, HR) {
  const h = L.hat, col = L.hatCol, top = HY - HR;
  const tassel = (x, y, colr = '#d23b2f') => { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 8); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); c.beginPath(); c.moveTo(x - 7, y - 6); c.quadraticCurveTo(x, y - 22, x + 7, y - 6); c.quadraticCurveTo(x, y - 2, x - 7, y - 6); c.closePath(); fillOut(colr, 2); };
  const dome = (metal, low = 4) => {
    c.beginPath(); c.moveTo(HX - HR - 4, HY - low); c.quadraticCurveTo(HX - HR - 2, top - 14, HX, top - 12); c.quadraticCurveTo(HX + HR + 2, top - 14, HX + HR + 4, HY - low); c.closePath(); fillOut(metal);
    P([[HX - HR - 6, HY - low - 6], [HX + HR + 6, HY - low - 6], [HX + HR + 6, HY - low + 1], [HX - HR - 6, HY - low + 1]]); fillOut(L.side, 2.2);
    c.fillStyle = '#e8c35a'; for (const x of [-22, 0, 22]) { E(HX + x, HY - low - 2.5, 2, 2); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.35)'; E(HX - 12, top - 2, 9, 4, -0.3); c.fill();
    // cheek guards
    for (const s of [-1, 1]) { P([[HX + s * (HR + 4), HY - low], [HX + s * (HR + 6), HY + 10], [HX + s * (HR - 4), HY + 14], [HX + s * (HR - 4), HY - low]]); fillOut(shade(metal, 0.9), 2); }
  };
  if (h === 'helmet') { dome(L.metal); tassel(HX, top - 12, L.plume); }
  else if (h === 'plume' || h === 'lion') {
    dome(L.metal);
    // a big plume over the back
    c.beginPath(); c.moveTo(HX, top - 12); c.quadraticCurveTo(HX + 34, top - 40, HX + 50, top - 4); c.quadraticCurveTo(HX + 30, top - 18, HX + 4, top - 4); c.closePath(); fillOut(L.plume, 2.2);
    c.beginPath(); c.moveTo(HX, top - 12); c.lineTo(HX, top - 20); c.strokeStyle = INK; c.lineWidth = 3; c.stroke(); E(HX, top - 22, 4, 4); fillOut('#d4a72c', 2);
    if (h === 'lion') { E(HX, HY - 18, 9, 7); fillOut('#d4a72c', 2); c.fillStyle = INK; for (const s of [-1, 1]) { E(HX + s * 3.5, HY - 19, 1.4, 1.4); c.fill(); } }
  } else if (h === 'ming') {
    dome(L.metal, 2);
    c.beginPath(); c.moveTo(HX, top - 12); c.lineTo(HX, top - 30); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
    tassel(HX, top - 26, '#d23b2f');
    c.beginPath(); c.ellipse(HX, HY - 6, HR + 12, 6, 0, 0, Math.PI * 2); fillOut(shade(L.metal, 0.85), 2);
  } else if (h === 'pheasant') {
    // 束发紫金冠 with two long pheasant feathers
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(HX + s * 8, top - 2); c.bezierCurveTo(HX + s * 20, top - 50, HX + s * 52, top - 54, HX + s * 62, top - 30); c.strokeStyle = INK; c.lineWidth = 7; c.stroke(); c.strokeStyle = '#d4a72c'; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#8a3a2a'; c.setLineDash([3, 4]); c.lineWidth = 3; c.stroke(); c.setLineDash([]); }
    P([[HX - 16, top + 6], [HX - 18, top - 8], [HX - 8, top - 2], [HX, top - 14], [HX + 8, top - 2], [HX + 18, top - 8], [HX + 16, top + 6]]); fillOut('#d4a72c');
    E(HX, top + 1, 4, 4); fillOut('#7a3fa0', 1.8);
    c.beginPath(); c.moveTo(HX - 24, top + 8); c.quadraticCurveTo(HX, top + 2, HX + 24, top + 8); c.strokeStyle = '#7a3fa0'; c.lineWidth = 4; c.stroke();
  } else if (h === 'crown') {
    // 冕: a flat board with strings of beads
    P([[HX - 18, top - 2], [HX + 18, top - 2], [HX + 15, top - 16], [HX - 15, top - 16]]); fillOut('#2b2320', 2.4);
    P([[HX - 30, top - 22], [HX + 30, top - 22], [HX + 30, top - 15], [HX - 30, top - 15]]); fillOut('#2b2320', 2.4);
    c.fillStyle = '#d4a72c'; c.strokeStyle = INK; c.lineWidth = 1;
    for (let x = -26; x <= 26; x += 8.6) for (let k = 0; k < 3; k++) { E(HX + x, top - 11 + k * 5, 1.9, 1.9); c.fill(); c.stroke(); }
    P([[HX - 30, top - 21], [HX + 30, top - 21], [HX + 30, top - 19], [HX - 30, top - 19]]); c.fillStyle = '#d4a72c'; c.fill();
  } else if (h === 'guan' || h === 'futou' || h === 'wusha') {
    // 进贤冠 / 幞头 / 乌纱帽: a black official's hat
    c.beginPath(); c.moveTo(HX - HR + 2, HY - 12); c.quadraticCurveTo(HX - HR + 4, top - 12, HX, top - 14); c.quadraticCurveTo(HX + HR - 4, top - 12, HX + HR - 2, HY - 12); c.closePath(); fillOut('#2b2320');
    if (h === 'guan') { P([[HX - 12, top - 10], [HX - 6, top - 26], [HX + 14, top - 22], [HX + 12, top - 8]]); fillOut('#2b2320'); P([[HX - 26, HY - 18], [HX + 26, HY - 18], [HX + 26, HY - 13], [HX - 26, HY - 13]]); fillOut(col, 2); }
    if (h === 'futou') { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(HX + s * 12, top - 6); c.quadraticCurveTo(HX + s * 40, top + 6, HX + s * 34, HY + 20); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#3a302a'; c.lineWidth = 3; c.stroke(); } E(HX, top - 14, 13, 9); fillOut('#2b2320'); }
    if (h === 'wusha') { E(HX, top - 16, 15, 10); fillOut('#2b2320'); for (const s of [-1, 1]) { P([[HX + s * 22, HY - 20], [HX + s * 52, HY - 26], [HX + s * 54, HY - 18], [HX + s * 22, HY - 14]]); fillOut('#2b2320', 2); } }
  } else if (h === 'lunjin') {
    // 纶巾: a cloth scarf with two ribbons
    c.beginPath(); c.moveTo(HX - HR, HY - 8); c.quadraticCurveTo(HX - HR, top - 18, HX, top - 20); c.quadraticCurveTo(HX + HR, top - 18, HX + HR, HY - 8); c.quadraticCurveTo(HX, HY - 16, HX - HR, HY - 8); c.closePath(); fillOut(col);
    c.strokeStyle = shade(col, 0.75); c.lineWidth = 1.5; for (const x of [-14, 0, 14]) { c.beginPath(); c.moveTo(HX + x, top - 16); c.lineTo(HX + x * 1.2, HY - 12); c.stroke(); }
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(HX + s * 26, HY - 10); c.quadraticCurveTo(HX + s * 44, HY + 4, HX + s * 40, HY + 26); c.strokeStyle = INK; c.lineWidth = 6.5; c.stroke(); c.strokeStyle = col; c.lineWidth = 3.5; c.stroke(); }
  } else if (h === 'scarf') {
    // 关羽's green scarf, knotted at the back
    c.beginPath(); c.moveTo(HX - HR - 1, HY - 4); c.quadraticCurveTo(HX - HR, top - 14, HX, top - 14); c.quadraticCurveTo(HX + HR, top - 14, HX + HR + 1, HY - 4); c.quadraticCurveTo(HX, HY - 14, HX - HR - 1, HY - 4); c.closePath(); fillOut(col);
    c.beginPath(); c.moveTo(HX + HR - 4, HY - 10); c.quadraticCurveTo(HX + HR + 20, HY - 22, HX + HR + 22, HY - 2); c.quadraticCurveTo(HX + HR + 10, HY - 8, HX + HR - 2, HY - 2); c.closePath(); fillOut(shade(col, 0.85), 2);
    c.fillStyle = 'rgba(255,255,255,.25)'; E(HX - 10, top - 4, 10, 4, -0.2); c.fill();
  } else if (h === 'band' || h === 'yellow') {
    const bc = h === 'yellow' ? '#e8b923' : col;
    P([[HX - HR, HY - 14], [HX + HR, HY - 14], [HX + HR - 1, HY - 6], [HX - HR + 1, HY - 6]]); fillOut(bc, 2.2);
    for (const s of [0.6, 1]) { c.beginPath(); c.moveTo(HX + HR - 2, HY - 10); c.quadraticCurveTo(HX + HR + 16 * s, HY - 4, HX + HR + 12 * s, HY + 14 * s); c.strokeStyle = INK; c.lineWidth = 5; c.stroke(); c.strokeStyle = bc; c.lineWidth = 2.6; c.stroke(); }
    if (h === 'yellow') { E(HX, top - 6, 8, 7); fillOut('#2b2320', 2.2); c.beginPath(); c.moveTo(HX - 10, top - 6); c.lineTo(HX + 10, top - 6); c.strokeStyle = '#d4a72c'; c.lineWidth = 2.5; c.stroke(); }
  } else if (h === 'feathers') {
    const cols = ['#c0392b', '#e8b923', '#2f8f4e', '#2f5fae', '#c0392b'];
    for (let i = 0; i < 5; i++) { const a = -0.7 + i * 0.35; c.save(); c.translate(HX + Math.sin(a) * 22, top + 4); c.rotate(a); E(0, -14, 5, 16); fillOut(cols[i], 2); c.restore(); }
    P([[HX - HR, HY - 16], [HX + HR, HY - 16], [HX + HR - 1, HY - 8], [HX - HR + 1, HY - 8]]); fillOut('#8a5a2c', 2.2);
    c.fillStyle = '#e8b923'; for (let x = -24; x <= 24; x += 8) { E(HX + x, HY - 12, 2, 2); c.fill(); }
  } else if (h === 'mongol' || h === 'fur') {
    c.beginPath(); c.moveTo(HX - 22, top + 2); c.quadraticCurveTo(HX - 18, top - 26, HX, top - 30); c.quadraticCurveTo(HX + 18, top - 26, HX + 22, top + 2); c.closePath(); fillOut(h === 'fur' ? '#3a5a7a' : col);
    E(HX, HY - 14, HR + 6, 11); fillOut(h === 'fur' ? '#e8e2d6' : '#7a5230');
    c.strokeStyle = shade(h === 'fur' ? '#e8e2d6' : '#7a5230', 0.75); c.lineWidth = 1.4; for (let x = -32; x <= 32; x += 6) { c.beginPath(); c.moveTo(HX + x, HY - 22); c.lineTo(HX + x + 2, HY - 7); c.stroke(); }
    E(HX, top - 30, 4, 4); fillOut('#d4a72c', 2);
    if (h === 'fur') for (const s of [-1, 1]) { c.beginPath(); c.moveTo(HX + s * (HR + 2), HY - 8); c.quadraticCurveTo(HX + s * (HR + 10), HY + 14, HX + s * (HR + 4), HY + 30); c.strokeStyle = INK; c.lineWidth = 7; c.stroke(); c.strokeStyle = '#e8e2d6'; c.lineWidth = 4; c.stroke(); }
  } else if (h === 'qing') {
    // a Qing official's summer hat: a cone with red tassels and a jewel on top
    c.beginPath(); c.moveTo(HX - HR - 10, HY - 10); c.lineTo(HX, top - 22); c.lineTo(HX + HR + 10, HY - 10); c.quadraticCurveTo(HX, HY - 4, HX - HR - 10, HY - 10); c.closePath(); fillOut('#e6cf8a');
    c.beginPath(); c.moveTo(HX - HR + 2, HY - 12); c.lineTo(HX, top - 20); c.lineTo(HX + HR - 2, HY - 12); c.quadraticCurveTo(HX, HY - 8, HX - HR + 2, HY - 12); c.closePath(); c.fillStyle = '#c0392b'; c.fill();
    c.strokeStyle = '#8a1f1f'; c.lineWidth = 1.2; for (let x = -24; x <= 24; x += 5) { c.beginPath(); c.moveTo(HX, top - 20); c.lineTo(HX + x, HY - 11); c.stroke(); }
    E(HX, top - 22, 5, 5); fillOut('#2f8f4e', 2);
  } else if (h === 'bun') {
    E(HX, top - 6, 16, 12); fillOut('#2b2320');
    E(HX + 14, top - 2, 9, 8); fillOut('#2b2320');
    c.beginPath(); c.moveTo(HX - 20, top - 10); c.lineTo(HX + 24, top - 18); c.strokeStyle = INK; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#d4a72c'; c.lineWidth = 2.2; c.stroke();
    E(HX - 18, top - 8, 5, 5); fillOut(col, 1.8); E(HX + 26, top - 18, 3, 3); fillOut('#e8b923', 1.5);
    for (const s of [-1, 1]) { E(HX + s * 8, top - 14, 4, 4); fillOut(col, 1.5); }
  } else if (h === 'femhelm') {
    c.beginPath(); c.moveTo(HX - HR - 2, HY - 8); c.quadraticCurveTo(HX - HR, top - 12, HX, top - 10); c.quadraticCurveTo(HX + HR, top - 12, HX + HR + 2, HY - 8); c.closePath(); fillOut(L.metal);
    P([[HX - HR - 4, HY - 13], [HX + HR + 4, HY - 13], [HX + HR + 4, HY - 7], [HX - HR - 4, HY - 7]]); fillOut(shade(L.metal, 0.8), 2);
    c.beginPath(); c.moveTo(HX - 2, top - 10); c.bezierCurveTo(HX - 10, top - 40, HX + 30, top - 46, HX + 42, top - 22); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = L.plume; c.lineWidth = 3.4; c.stroke();
    E(HX, HY - 10, 4, 4); fillOut('#d23b2f', 1.8);
  } else if (h === 'mask') {
    dome(L.metal, 2);
    tassel(HX, top - 12, '#d23b2f');
    // the famous mask, pushed up onto the helmet
    c.beginPath(); c.moveTo(HX - 18, top - 4); c.quadraticCurveTo(HX, top - 18, HX + 18, top - 4); c.quadraticCurveTo(HX + 14, top + 10, HX, top + 12); c.quadraticCurveTo(HX - 14, top + 10, HX - 18, top - 4); c.closePath(); fillOut('#5a6470');
    c.fillStyle = '#d23b2f'; for (const s of [-1, 1]) { P([[HX + s * 4, top + 0], [HX + s * 13, top - 4], [HX + s * 11, top + 3]]); c.fill(); }
    c.strokeStyle = '#d4a72c'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(HX, top - 12); c.lineTo(HX, top + 10); c.stroke();
  }
}

// long weapons stand behind the right shoulder; their heads show above it
function weaponBack(c, L, out, fillOut, P, E) {
  const w = L.weapon;
  const shaft = (x0, y0, x1, y1, col = '#7a5230', lw = 5) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = INK; c.lineWidth = lw + 3; c.stroke(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
  const X0 = 100, Y0 = 128, X1 = 118, Y1 = 6;
  const steel = '#dfe5ea';
  if (w === 'spear' || w === 'snake' || w === 'halberd' || w === 'glaive' || w === 'glaive2' || w === 'staff' || w === 'flag') {
    shaft(X0, Y0, X1, Y1 + 18, w === 'staff' ? '#8a6a3a' : w === 'halberd' ? '#7a3fa0' : '#7a5230');
    const tx = X1, ty = Y1 + 18, a = Math.atan2(Y1 + 18 - Y0, X1 - X0);
    c.save(); c.translate(tx, ty); c.rotate(a + Math.PI / 2);
    if (w === 'spear') { P([[0, -26], [6, -8], [0, 2], [-6, -8]]); fillOut(steel, 2.2); P([[-7, 2], [7, 2], [5, 8], [-5, 8]]); fillOut('#d23b2f', 2); }
    if (w === 'snake') { c.beginPath(); c.moveTo(-4, 4); for (let i = 0; i < 4; i++) c.quadraticCurveTo(i % 2 ? -10 : 6, -6 - i * 8, 0, -10 - i * 8); c.lineTo(3, -44); c.quadraticCurveTo(8, -20, 5, 4); c.closePath(); fillOut(steel, 2.2); }
    if (w === 'halberd') { P([[0, -30], [5, -10], [0, 0], [-5, -10]]); fillOut(steel, 2.2); for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 3, -12); c.quadraticCurveTo(s * 22, -18, s * 18, -2); c.quadraticCurveTo(s * 14, -10, s * 3, -4); c.closePath(); fillOut('#e9d27a', 2); } }
    if (w === 'glaive' || w === 'glaive2') { c.beginPath(); c.moveTo(-3, 4); c.quadraticCurveTo(-4, -26, 10, -40); c.quadraticCurveTo(22, -20, 6, 4); c.closePath(); fillOut(w === 'glaive' ? '#cfe3d6' : steel, 2.4); if (w === 'glaive') { c.strokeStyle = '#2f8f4e'; c.lineWidth = 2; c.beginPath(); c.moveTo(2, -4); c.quadraticCurveTo(4, -20, 10, -30); c.stroke(); } }
    if (w === 'staff') { E(0, -6, 7, 7); fillOut('#e8b923', 2); for (const s of [-1, 1]) { E(s * 8, -1, 3, 3); fillOut('#e8b923', 1.5); } }
    if (w === 'flag') { P([[2, -2], [2, -30], [30, -26], [26, -14], [30, -4]]); fillOut('#d23b2f', 2.2); c.fillStyle = '#fff'; c.font = '900 13px serif'; c.textAlign = 'center'; c.save(); c.translate(15, -16); c.rotate(-a - Math.PI / 2); c.fillText(L.id === 'hanxin' ? '韩' : '帅', 0, 5); c.restore(); }
    c.restore();
  } else if (w === 'twinhalb') {
    for (const [x0, x1] of [[96, 122], [112, 90]]) { shaft(x0, 128, x1, 26, '#7a5230', 4.5); c.save(); c.translate(x1, 26); c.rotate(Math.atan2(26 - 128, x1 - x0) + Math.PI / 2); P([[0, -18], [5, -4], [0, 2], [-5, -4]]); fillOut(steel, 2); c.beginPath(); c.moveTo(3, -8); c.quadraticCurveTo(16, -12, 13, 0); c.quadraticCurveTo(10, -6, 3, -3); c.closePath(); fillOut(steel, 2); c.restore(); }
  } else if (w === 'bow') {
    c.beginPath(); c.moveTo(102, 20); c.quadraticCurveTo(130, 70, 104, 122); c.strokeStyle = INK; c.lineWidth = 8; c.stroke(); c.strokeStyle = '#a0522d'; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.moveTo(102, 20); c.lineTo(104, 122); c.strokeStyle = '#f4efe2'; c.lineWidth = 1.4; c.stroke();
    // quiver feathers over the other shoulder
    for (const x of [16, 22, 28]) { c.beginPath(); c.moveTo(x + 8, 96); c.lineTo(x, 70); c.strokeStyle = INK; c.lineWidth = 3; c.stroke(); P([[x - 4, 70], [x + 4, 70], [x, 60]]); fillOut('#f4efe2', 1.6); }
  } else if (w === 'axe') {
    shaft(98, 128, 112, 28, '#7a5230', 6);
    c.save(); c.translate(112, 32); c.rotate(-0.1);
    c.beginPath(); c.moveTo(-2, -8); c.quadraticCurveTo(-26, -16, -24, 12); c.quadraticCurveTo(-12, 6, -2, 10); c.closePath(); fillOut(steel, 2.4);
    c.restore();
  } else if (w === 'saber') {
    shaft(104, 122, 116, 36, '#3a302a', 4);
    c.save(); c.translate(116, 36); c.rotate(0.15);
    c.beginPath(); c.moveTo(-3, 0); c.quadraticCurveTo(-6, -30, 6, -40); c.quadraticCurveTo(4, -20, 4, 0); c.closePath(); fillOut(steel, 2.2); c.restore();
  } else if (w === 'mace' || w === 'whip') {
    for (const [x0, x1] of w === 'whip' ? [[100, 120]] : [[98, 118], [110, 92]]) {
      shaft(x0, 128, x1, 34, '#3a302a', 4);
      c.save(); c.translate(x1, 34); c.rotate(Math.atan2(34 - 128, x1 - x0) + Math.PI / 2);
      if (w === 'whip') for (let i = 0; i < 5; i++) { E(0, -6 - i * 7, 5, 4); fillOut('#8a96ad', 1.8); }
      else { P([[-5, 0], [5, 0], [4, -30], [-4, -30]]); fillOut('#d4a72c', 2.2); }
      c.restore();
    }
  } else if (w === 'sword' || w === 'twin') {
    const pairs = w === 'twin' ? [[104, 120, 114, 40], [110, 122, 98, 44]] : [[104, 122, 114, 42]];
    for (const [x0, y0, x1, y1] of pairs) {
      c.save(); c.translate(x1, y1); c.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2);
      P([[-3.5, 2], [3.5, 2], [3, -38], [0, -44], [-3, -38]]); fillOut(steel, 2.2);
      P([[-10, 2], [10, 2], [10, 7], [-10, 7]]); fillOut('#d4a72c', 2);
      c.restore();
    }
  } else if (w === 'knives') {
    for (const [x, a] of [[104, 0.4], [114, 0.1], [122, -0.2]]) { c.save(); c.translate(x, 46); c.rotate(a); P([[0, -20], [4, -6], [0, 0], [-4, -6]]); fillOut(steel, 2); P([[-2, 0], [2, 0], [2, 8], [-2, 8]]); fillOut('#d23b2f', 1.5); c.restore(); }
  } else if (w === 'drum') {
    c.save(); c.translate(108, 40); E(0, 0, 16, 16); fillOut('#c0392b', 2.4); E(0, 0, 11, 11); fillOut('#f3e2c7', 2); c.restore();
    shaft(90, 120, 118, 18, '#7a5230', 3);
  }
}
function weaponFront(c, L, out, fillOut, P, E) {
  const w = L.weapon;
  if (w === 'fan' || w === 'fan2') {
    c.save(); c.translate(92, 108); c.rotate(-0.3);
    c.beginPath(); c.moveTo(0, 12); c.lineTo(0, 0); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#7a5230'; c.lineWidth = 3.5; c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-18, -16, -10, -34); c.quadraticCurveTo(0, -40, 10, -34); c.quadraticCurveTo(18, -16, 0, 0); c.closePath(); fillOut(w === 'fan' ? '#ffffff' : '#f3e6c8', 2.4);
    c.strokeStyle = 'rgba(43,33,26,.35)'; c.lineWidth = 1.2; for (const x of [-6, 0, 6]) { c.beginPath(); c.moveTo(0, -2); c.lineTo(x, -32); c.stroke(); }
    c.restore();
  } else if (w === 'fanw') {
    c.save(); c.translate(90, 112); c.rotate(-0.4);
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 24, -Math.PI * 0.85, -Math.PI * 0.15); c.closePath(); fillOut('#ffd1e0', 2.4);
    c.strokeStyle = 'rgba(43,33,26,.35)'; c.lineWidth = 1; for (let i = 1; i < 6; i++) { const a = -Math.PI * (0.85 - i * 0.117); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 24, Math.sin(a) * 24); c.stroke(); }
    c.fillStyle = '#d23b2f'; E(-6, -14, 3, 3); c.fill(); E(4, -16, 2.5, 2.5); c.fill();
    c.restore();
  } else if (w === 'scroll' || w === 'bamboo' || w === 'book' || w === 'abacus' || w === 'brush' || w === 'qin') {
    c.save(); c.translate(86, 112); c.rotate(-0.25);
    if (w === 'scroll') { P([[-14, -8], [14, -8], [14, 8], [-14, 8]]); fillOut('#f3e6c8', 2); for (const s of [-1, 1]) { E(s * 15, 0, 3.5, 10); fillOut('#a0522d', 2); } c.strokeStyle = 'rgba(43,33,26,.4)'; c.lineWidth = 1.2; for (const y of [-3, 1, 5]) { c.beginPath(); c.moveTo(-9, y); c.lineTo(9, y); c.stroke(); } }
    if (w === 'bamboo') { for (let i = -3; i <= 3; i++) { P([[i * 5 - 2, -12], [i * 5 + 2, -12], [i * 5 + 2, 12], [i * 5 - 2, 12]]); fillOut('#d9c27a', 1.4); } c.strokeStyle = '#7a5230'; c.lineWidth = 1.5; for (const y of [-6, 6]) { c.beginPath(); c.moveTo(-18, y); c.lineTo(18, y); c.stroke(); } }
    if (w === 'book') { P([[-12, -14], [12, -14], [12, 14], [-12, 14]]); fillOut('#2f5fae', 2.2); P([[-6, -10], [6, -10], [6, -2], [-6, -2]]); fillOut('#f3e6c8', 1.4); }
    if (w === 'abacus') { P([[-16, -11], [16, -11], [16, 11], [-16, 11]]); fillOut('#7a5230', 2.2); c.fillStyle = '#f3e6c8'; for (let x = -12; x <= 12; x += 6) for (const y of [-6, 2, 6]) { E(x, y, 2.2, 1.8); c.fill(); } }
    if (w === 'brush') { c.beginPath(); c.moveTo(0, 14); c.lineTo(0, -12); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#a0522d'; c.lineWidth = 3.5; c.stroke(); c.beginPath(); c.moveTo(-3, -12); c.quadraticCurveTo(0, -26, 3, -12); c.closePath(); fillOut('#2b2320', 1.6); }
    if (w === 'qin') { c.rotate(0.25); P([[-26, -6], [22, -8], [24, 4], [-24, 6]]); fillOut('#7a3f2a', 2.2); c.strokeStyle = '#f3e6c8'; c.lineWidth = 0.9; for (const y of [-3, 0, 3]) { c.beginPath(); c.moveTo(-20, y); c.lineTo(20, y - 1); c.stroke(); } }
    c.restore();
  }
}

// ---------------------------------------------------------------- cache
const cache = new Map();
export function portraitURL(id, px = 192) {
  const key = id + '@' + px;
  let u = cache.get(key);
  if (u) return u;
  if (typeof document === 'undefined' || !GENERALS[id]) return '';
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  drawPortrait(cv.getContext('2d'), lookOf(id), px);
  u = cv.toDataURL('image/png');
  cache.set(key, u);
  return u;
}
