// 万锦三国志 (Three Kingdoms mode, D-73): static data. Generals, their signature traits, bonds and
// rivalries, and the 12 Markham "cities" with the real roads that link them (the supply lines).
// Stats are our own estimates (统率 lead, 武力 war, 智力 int, 政治 pol), not copied from any game.
import { ELEV } from './sg_elev.js';

// trait key -> [zh name, en name, zh desc, en desc]
export const TRAITS = {
  wansheng: ['武圣', 'War Saint', '单挑伤害 +35%', 'Duel damage +35%'],
  wanren: ['万人敌', 'Match for 10,000', '兵比敌少时攻击 +30%', 'Attack +30% when outnumbered'],
  longdan: ['龙胆', 'Dragon Heart', '单挑伤害 +30%，城破时不会被俘', 'Duel damage +30%, never captured'],
  shensuan: ['神算', 'Divine Plans', '攻击 +20%（计谋）', 'Attack +20% (stratagems)'],
  danlve: ['胆略', 'Daring', '攻击 +12%，单挑伤害 +15%', 'Attack +12%, duel damage +15%'],
  jinma: ['锦马超', 'Splendid Ma Chao', '进攻时攻击 +20%', 'Attack +20% when attacking'],
  baibu: ['百步穿杨', 'Hundred Paces', '攻击 +15%', 'Attack +15%'],
  fangu: ['反骨', 'Rebel Bone', '攻击 +10%，忠诚低', 'Attack +10%, low loyalty'],
  lianhuan: ['连环', 'Chain Plan', '攻击 +18%（计谋）', 'Attack +18% (stratagems)'],
  qimou: ['奇谋', 'Cunning', '攻击 +12%，搜索更容易', 'Attack +12%, better searching'],
  renmin: ['仁德', 'Benevolence', '搜索成功率大增，登用更容易', 'Much better searching and recruiting'],
  jianxiong: ['奸雄', 'Hero of Chaos', '攻击 +12%，内政 +30%', 'Attack +12%, development +30%'],
  ganglie: ['刚烈', 'Fierce', '守城 +15%，单挑伤害 +10%', 'Defence +15%, duel damage +10%'],
  shensu: ['神速', 'Lightning', '进攻时攻击 +18%', 'Attack +18% when attacking'],
  xiaoyao: ['威震逍遥津', 'Terror of Xiaoyao', '兵比敌少时攻击 +30%', 'Attack +30% when outnumbered'],
  huchi: ['虎痴', 'Mad Tiger', '单挑伤害 +30%', 'Duel damage +30%'],
  elai: ['古之恶来', 'E Lai Reborn', '守城 +20%，单挑伤害 +15%', 'Defence +20%, duel damage +15%'],
  yingshi: ['鹰视狼顾', 'Wolf Gaze', '攻击 +15%，守城 +15%', 'Attack +15%, defence +15%'],
  guicai: ['鬼才', 'Ghost Talent', '攻击 +20%（计谋）', 'Attack +20% (stratagems)'],
  wangzuo: ['王佐', 'Royal Aide', '内政 +60%，征兵 +30%', 'Development +60%, drafting +30%'],
  tiebi: ['铁壁', 'Iron Wall', '守城 +30%', 'Defence +30%'],
  xiaobawang: ['小霸王', 'Little Conqueror', '进攻时攻击 +20%，单挑伤害 +10%', 'Attack +20% when attacking, duel +10%'],
  biyan: ['碧眼', 'Jade Eyes', '内政 +30%，守城 +10%', 'Development +30%, defence +10%'],
  huoshen: ['火神', 'Fire God', '攻击 +25%（火攻）', 'Attack +25% (fire)'],
  waijiao: ['外交', 'Diplomat', '内政 +30%，登用更容易', 'Development +30%, easier recruiting'],
  baiyi: ['白衣渡江', 'White-robed Crossing', '进攻时攻击 +20%', 'Attack +20% when attacking'],
  huoshao: ['火烧连营', 'Burning Camps', '攻击 +22%（火攻）', 'Attack +22% (fire)'],
  jinfan: ['锦帆', 'Brocade Sails', '进攻时攻击 +15%，单挑伤害 +10%', 'Attack +15% when attacking, duel +10%'],
  shenshe: ['神射', 'Sharpshooter', '攻击 +15%，单挑伤害 +10%', 'Attack +15%, duel damage +10%'],
  kurou: ['苦肉计', 'Self-injury Ruse', '攻击 +12%（计谋）', 'Attack +12% (stratagems)'],
  feijiang: ['飞将', 'Flying General', '单挑伤害 +45%', 'Duel damage +45%'],
  baonue: ['暴虐', 'Tyrant', '征兵 +40%', 'Drafting +40%'],
  biyue: ['闭月', 'Moon-hiding Beauty', '搜索、登用更容易', 'Better searching and recruiting'],
  mingmen: ['名门', 'Noble House', '征兵 +40%，内政 +20%', 'Drafting +40%, development +20%'],
  baima: ['白马义从', 'White Horse', '进攻时攻击 +18%', 'Attack +18% when attacking'],
  yaoshu: ['妖术', 'Sorcery', '攻击 +18%（妖术）', 'Attack +18% (sorcery)'],
  qiqin: ['七擒', 'Seven Captures', '守城 +20%', 'Defence +20%'],
  feidao: ['飞刀', 'Flying Knives', '单挑伤害 +20%', 'Duel damage +20%'],
  xianzhen: ['陷阵', 'Vanguard', '攻击 +15%', 'Attack +15%'],
  yongmeng: ['勇猛', 'Valiant', '单挑伤害 +15%', 'Duel damage +15%'],
  shouye: ['守备', 'Garrison', '守城 +15%', 'Defence +15%'],
  zhengzhi: ['能吏', 'Able Official', '内政 +30%', 'Development +30%'],
};

// trait key -> numeric effects (multipliers are additive bonuses)
export const TRAIT_FX = {
  wansheng: { duel: 0.35 }, wanren: { few: 0.3 }, longdan: { duel: 0.3, safe: 1 }, shensuan: { atk: 0.2 },
  danlve: { atk: 0.12, duel: 0.15 }, jinma: { raid: 0.2 }, baibu: { atk: 0.15 }, fangu: { atk: 0.1, loyal: -30 },
  lianhuan: { atk: 0.18 }, qimou: { atk: 0.12, search: 0.15 }, renmin: { search: 0.3, recruit: 0.25 },
  jianxiong: { atk: 0.12, dev: 0.3 }, ganglie: { def: 0.15, duel: 0.1 }, shensu: { raid: 0.18 }, xiaoyao: { few: 0.3 },
  huchi: { duel: 0.3 }, elai: { def: 0.2, duel: 0.15 }, yingshi: { atk: 0.15, def: 0.15 }, guicai: { atk: 0.2 },
  wangzuo: { dev: 0.6, draft: 0.3 }, tiebi: { def: 0.3 }, xiaobawang: { raid: 0.2, duel: 0.1 }, biyan: { dev: 0.3, def: 0.1 },
  huoshen: { atk: 0.25 }, waijiao: { dev: 0.3, recruit: 0.2 }, baiyi: { raid: 0.2 }, huoshao: { atk: 0.22 },
  jinfan: { raid: 0.15, duel: 0.1 }, shenshe: { atk: 0.15, duel: 0.1 }, kurou: { atk: 0.12 }, feijiang: { duel: 0.45 },
  baonue: { draft: 0.4 }, biyue: { search: 0.2, recruit: 0.2 }, mingmen: { draft: 0.4, dev: 0.2 }, baima: { raid: 0.18 },
  yaoshu: { atk: 0.18 }, qiqin: { def: 0.2 }, feidao: { duel: 0.2 }, xianzhen: { atk: 0.15 }, yongmeng: { duel: 0.15 },
  shouye: { def: 0.15 }, zhengzhi: { dev: 0.3 },
};

// [id, zh, en, 统率, 武力, 智力, 政治, trait, kingdom (portrait colour)]
const G = [
  ['liubei', '刘备', 'Liu Bei', 75, 73, 74, 80, 'renmin', 'shu'],
  ['guanyu', '关羽', 'Guan Yu', 95, 97, 75, 62, 'wansheng', 'shu'],
  ['zhangfei', '张飞', 'Zhang Fei', 85, 98, 30, 22, 'wanren', 'shu'],
  ['zhugeliang', '诸葛亮', 'Zhuge Liang', 92, 38, 100, 95, 'shensuan', 'shu'],
  ['zhaoyun', '赵云', 'Zhao Yun', 91, 96, 76, 65, 'longdan', 'shu'],
  ['machao', '马超', 'Ma Chao', 88, 97, 44, 26, 'jinma', 'shu'],
  ['huangzhong', '黄忠', 'Huang Zhong', 86, 93, 60, 52, 'baibu', 'shu'],
  ['jiangwei', '姜维', 'Jiang Wei', 90, 89, 88, 66, 'danlve', 'shu'],
  ['weiyan', '魏延', 'Wei Yan', 82, 91, 48, 40, 'fangu', 'shu'],
  ['pangtong', '庞统', 'Pang Tong', 84, 34, 97, 85, 'lianhuan', 'shu'],
  ['fazheng', '法正', 'Fa Zheng', 78, 47, 94, 82, 'qimou', 'shu'],
  ['caocao', '曹操', 'Cao Cao', 97, 72, 91, 94, 'jianxiong', 'wei'],
  ['xiahoudun', '夏侯惇', 'Xiahou Dun', 88, 90, 58, 70, 'ganglie', 'wei'],
  ['xiahouyuan', '夏侯渊', 'Xiahou Yuan', 87, 90, 55, 44, 'shensu', 'wei'],
  ['zhangliao', '张辽', 'Zhang Liao', 93, 92, 78, 58, 'xiaoyao', 'wei'],
  ['xuchu', '许褚', 'Xu Chu', 66, 96, 36, 20, 'huchi', 'wei'],
  ['dianwei', '典韦', 'Dian Wei', 56, 95, 35, 27, 'elai', 'wei'],
  ['simayi', '司马懿', 'Sima Yi', 98, 63, 96, 93, 'yingshi', 'wei'],
  ['guojia', '郭嘉', 'Guo Jia', 55, 15, 98, 86, 'guicai', 'wei'],
  ['xunyu', '荀彧', 'Xun Yu', 52, 14, 95, 99, 'wangzuo', 'wei'],
  ['xuhuang', '徐晃', 'Xu Huang', 87, 90, 69, 47, 'xianzhen', 'wei'],
  ['zhanghe', '张郃', 'Zhang He', 89, 89, 70, 54, 'shouye', 'wei'],
  ['caoren', '曹仁', 'Cao Ren', 89, 87, 62, 52, 'tiebi', 'wei'],
  ['sunjian', '孙坚', 'Sun Jian', 91, 90, 72, 74, 'yongmeng', 'wu'],
  ['sunce', '孙策', 'Sun Ce', 92, 94, 69, 70, 'xiaobawang', 'wu'],
  ['sunquan', '孙权', 'Sun Quan', 76, 67, 80, 89, 'biyan', 'wu'],
  ['zhouyu', '周瑜', 'Zhou Yu', 97, 71, 96, 86, 'huoshen', 'wu'],
  ['lusu', '鲁肃', 'Lu Su', 80, 56, 92, 90, 'waijiao', 'wu'],
  ['lvmeng', '吕蒙', 'Lü Meng', 91, 82, 89, 80, 'baiyi', 'wu'],
  ['luxun', '陆逊', 'Lu Xun', 95, 69, 95, 87, 'huoshao', 'wu'],
  ['ganning', '甘宁', 'Gan Ning', 86, 94, 55, 26, 'jinfan', 'wu'],
  ['taishici', '太史慈', 'Taishi Ci', 82, 93, 66, 45, 'shenshe', 'wu'],
  ['huanggai', '黄盖', 'Huang Gai', 76, 82, 67, 55, 'kurou', 'wu'],
  ['zhangzhao', '张昭', 'Zhang Zhao', 30, 20, 85, 96, 'zhengzhi', 'wu'],
  ['lvbu', '吕布', 'Lü Bu', 87, 100, 26, 13, 'feijiang', 'qun'],
  ['dongzhuo', '董卓', 'Dong Zhuo', 80, 88, 50, 20, 'baonue', 'qun'],
  ['diaochan', '貂蝉', 'Diaochan', 30, 26, 80, 68, 'biyue', 'qun'],
  ['yuanshao', '袁绍', 'Yuan Shao', 78, 69, 70, 75, 'mingmen', 'qun'],
  ['huaxiong', '华雄', 'Hua Xiong', 78, 92, 40, 30, 'yongmeng', 'qun'],
  ['yanliang', '颜良', 'Yan Liang', 80, 93, 42, 35, 'yongmeng', 'qun'],
  ['wenchou', '文丑', 'Wen Chou', 78, 92, 25, 30, 'yongmeng', 'qun'],
  ['gongsunzan', '公孙瓒', 'Gongsun Zan', 81, 84, 55, 57, 'baima', 'qun'],
  ['zhangjiao', '张角', 'Zhang Jiao', 85, 30, 87, 82, 'yaoshu', 'qun'],
  ['menghuo', '孟获', 'Meng Huo', 78, 87, 42, 45, 'qiqin', 'qun'],
  ['zhurong', '祝融', 'Zhurong', 74, 86, 35, 30, 'feidao', 'qun'],
  ['gaoshun', '高顺', 'Gao Shun', 87, 85, 55, 45, 'xianzhen', 'qun'],
  ['chengong', '陈宫', 'Chen Gong', 72, 45, 90, 80, 'qimou', 'qun'],
  ['jiaxu', '贾诩', 'Jia Xu', 80, 40, 97, 85, 'guicai', 'qun'],
];
export const GENERALS = Object.fromEntries(G.map(([id, zh, en, lead, war, int, pol, trait, k]) => [id, { id, zh, en, lead, war, int, pol, trait, k }]));
export const GEN_IDS = G.map((g) => g[0]);

// bonds: same army (scope 'army') or anywhere in the faction ('faction'), `need` members.
// fx: atk / def bonus for the army or city, dev / search bonus for the faction, duel bonus for members
export const BONDS = [
  { id: 'taoyuan', zh: '桃园结义', en: 'Peach Garden Oath', m: ['liubei', 'guanyu', 'zhangfei'], need: 2, scope: 'army', fx: { atk: 0.2, duel: 0.1 } },
  { id: 'wuhu', zh: '五虎上将', en: 'Five Tiger Generals', m: ['guanyu', 'zhangfei', 'zhaoyun', 'machao', 'huangzhong'], need: 3, scope: 'faction', fx: { atk: 0.12 } },
  { id: 'wolong', zh: '卧龙凤雏', en: 'Crouching Dragon & Young Phoenix', m: ['zhugeliang', 'pangtong'], need: 2, scope: 'faction', fx: { atk: 0.15, search: 0.15 } },
  { id: 'shuangbi', zh: '江东双璧', en: 'Twin Jades of Jiangdong', m: ['sunce', 'zhouyu'], need: 2, scope: 'army', fx: { atk: 0.2 } },
  { id: 'huwei', zh: '虎卫', en: 'Tiger Guards', m: ['xuchu', 'dianwei'], need: 2, scope: 'army', fx: { def: 0.25, atk: 0.1 } },
  { id: 'yuehua', zh: '月下吕布', en: 'Lü Bu under the Moon', m: ['lvbu', 'diaochan'], need: 2, scope: 'faction', fx: { duel: 0.15 } },
  { id: 'moushi', zh: '曹营谋主', en: 'Cao Cao\'s Strategists', m: ['xunyu', 'guojia', 'jiaxu'], need: 2, scope: 'faction', fx: { dev: 0.25, atk: 0.08 } },
  { id: 'xiahou', zh: '夏侯兄弟', en: 'The Xiahou Brothers', m: ['xiahoudun', 'xiahouyuan'], need: 2, scope: 'army', fx: { atk: 0.15 } },
  { id: 'hebei', zh: '河北双雄', en: 'Heroes of Hebei', m: ['yanliang', 'wenchou'], need: 2, scope: 'army', fx: { atk: 0.15 } },
  { id: 'nanman', zh: '南蛮王夫妻', en: 'King & Queen of the Nanman', m: ['menghuo', 'zhurong'], need: 2, scope: 'army', fx: { def: 0.2, atk: 0.1 } },
];

// rivals: when a member of one side meets a member of the other in battle, a duel is very likely
export const RIVALS = [
  { a: ['guanyu'], b: ['lvmeng'], zh: '败走麦城之仇', en: 'The grudge of Maicheng' },
  { a: ['zhangliao'], b: ['sunquan', 'ganning', 'taishici'], zh: '逍遥津', en: 'Xiaoyao Ford' },
  { a: ['lvbu'], b: ['liubei', 'guanyu', 'zhangfei'], zh: '三英战吕布', en: 'Three Heroes vs Lü Bu' },
  { a: ['machao'], b: ['caocao', 'xuchu'], zh: '割须弃袍', en: 'Cut beard, dropped robe' },
  { a: ['zhugeliang'], b: ['simayi', 'zhouyu'], zh: '斗智', en: 'Battle of wits' },
  { a: ['lvbu'], b: ['dongzhuo'], zh: '凤仪亭', en: 'Phoenix Pavilion' },
];

// the 12 cities and the 4 passes: [id, zh, en, game x, game z] (positions in maps/markham.json game
// metres). v0.8 (D-74): real terrain. `elev` is the real ground height (js/sg_elev.js, Copernicus DEM),
// `valley` marks the cities on the Rouge River (胭脂河) flats: rich farmland (more food), low ground.
const C = [
  ['btv', 'Buttonville', 'Buttonville', -1450, -1050, 1],
  ['wdb', 'Woodbine', 'Woodbine', -1450, -300, 0],
  ['civ', '万锦市政厅', 'Civic Centre', -741, -386, 0],
  ['dtm', 'Downtown Markham', 'Downtown Markham', -499, -14, 1],
  ['unv', 'Unionville', 'Unionville', 171, -632, 1],
  ['mkv', 'Markvile Mall', 'Markvile Mall', 907, -493, 1],
  ['ray', 'Raymerville', 'Raymerville', 1420, -880, 0],
  ['esn', 'Esna Park', 'Esna Park', -1100, 800, 0],
  ['hag', 'Hagerman', 'Hagerman', 120, 380, 0],
  ['pac', '大古广场', 'Pacifick Mall', -145, 1165, 0],
  ['mil', 'Milliken Mills', 'Milliken Mills', 600, 900, 0],
  ['arm', 'Armadale', 'Armadale', 1420, 1020, 0],
];
// Hwy 407 runs right across Markham like a great wall: the only ways over it are the real
// interchanges, and each one is a pass (关). Passes have no people (no development, drafting or
// searching) but very high walls; troops get there by moving in. The Kennedy Rd one is the big
// one, "407 虎牢关", guarded at the start by the strongest officer still at large.
const P = [
  ['g_wdb', 'Woodbine 关', 'Woodbine Gate', -1490, 105, 0],
  ['g_war', 'Warden 关', 'Warden Gate', -670, 135, 0],
  ['g_ken', '407 虎牢关', '407 Tiger Gate', 92, 122, 1],
  ['g_mcc', 'McCowan 关', 'McCowan Gate', 977, 118, 0],
];
export function elevAt(x, z) { // bilinear in the real elevation grid
  const fx = Math.min(ELEV.nx - 1.001, Math.max(0, (x - ELEV.x0) / ELEV.step)), fz = Math.min(ELEV.nz - 1.001, Math.max(0, (z - ELEV.z0) / ELEV.step));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, h = (a, b) => ELEV.h[b * ELEV.nx + a];
  return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
}
export const CITIES = Object.fromEntries([
  ...C.map(([id, zh, en, x, z, v]) => [id, { id, zh, en, x, z, valley: !!v, pass: false, elev: Math.round(elevAt(x, z)) }]),
  ...P.map(([id, zh, en, x, z, big]) => [id, { id, zh, en, x, z, valley: false, pass: true, big: !!big, elev: Math.round(elevAt(x, z)) }]),
]);
export const CITY_IDS = C.map((c) => c[0]);   // what you need to unite Markham
export const PASS_IDS = P.map((c) => c[0]);
export const NODE_IDS = [...CITY_IDS, ...PASS_IDS];

// links = supply lines along real roads: [a, b, road, crosses the Rouge River (渡河)]. The river flags
// are checked against maps/markham.json by tests/unit/sg.test.js. Markham Rd meets Hwy 407 just
// outside the map, so Raymerville and Armadale are not linked.
export const LINKS = [
  ['btv', 'wdb', 'Woodbine Ave', 1], ['btv', 'civ', '16th Ave', 0], ['wdb', 'civ', 'Hwy 7', 1],
  ['wdb', 'g_wdb', 'Woodbine Ave', 0], ['g_wdb', 'esn', 'Woodbine Ave', 0],
  ['civ', 'dtm', 'Enterprise Blvd', 1], ['civ', 'unv', 'Hwy 7', 0], ['dtm', 'unv', 'Main St Unionville', 1],
  ['dtm', 'g_ken', 'Kennedy Rd', 0], ['g_ken', 'hag', 'Kennedy Rd', 0],
  ['dtm', 'g_war', 'Warden Ave', 0], ['g_war', 'esn', 'Warden Ave', 0],
  ['esn', 'pac', 'Steeles Ave E', 0], ['esn', 'hag', '14th Ave', 0], ['hag', 'pac', 'Kennedy Rd', 0],
  ['hag', 'mil', '14th Ave', 0], ['pac', 'mil', 'Steeles Ave E', 0], ['mil', 'arm', 'Denison St', 0],
  ['mil', 'g_mcc', 'McCowan Rd', 0], ['g_mcc', 'mkv', 'McCowan Rd', 1],
  ['unv', 'mkv', 'Hwy 7', 0], ['unv', 'ray', '16th Ave', 0], ['mkv', 'ray', 'Hwy 7', 0],
];
export const ADJ = (() => {
  const a = Object.fromEntries(NODE_IDS.map((c) => [c, []]));
  for (const [x, y, road, river] of LINKS) { a[x].push({ c: y, road, river: !!river }); a[y].push({ c: x, road, river: !!river }); }
  return a;
})();

// faction colours (player first), chosen so they also differ in lightness
export const FACTION_COLORS = ['#2f7de1', '#d64545', '#7c55c9', '#e8892b'];
export const NEUTRAL_COLOR = '#9aa0a6';
