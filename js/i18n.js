const DICT = {
  zh: {
    start: '开始游戏', subtitle: '万锦 · 玩具城', lang: 'English', loading: '地图加载中…',
    help: '救命啊！', stop: '站住！', pow: '砰！', ouch: '哎哟！', angry: '找打是吧！', master: '你惹错人了！',
    busted: '被抓了！', ko: '被揍晕了…', honk: '嘀嘀！', stolen: '我的车！',
    punch: '拳', enter: '上车', run: '跑', exit: '下车', drift: '漂移', horn: '喇叭',
    controlsPC: 'WASD 移动 · Shift 跑 · 空格 出拳 / 漂移 · F 上下车 · H 喇叭',
    controlsMobile: '左边摇杆移动 · 右边按钮出拳、上车、跑',
    quality: '画质', high: '高', low: '低', mute: '静音', sound: '声音', settings: '设置', close: '关闭',
    credit: '地图数据 © OpenStreetMap 贡献者（ODbL）',
    tagline: '在万锦溜达、打路人、抢车，小心警察！',
    chase: '警察在追你！', escaped: '甩掉警察了',
  },
  en: {
    start: 'Play', subtitle: 'Markham · Toy Town', lang: '中文', loading: 'Loading map…',
    help: 'Help!', stop: 'Freeze!', pow: 'POW!', ouch: 'Ouch!', angry: 'Wanna fight?!', master: 'Wrong guy, buddy!',
    busted: 'BUSTED!', ko: 'Knocked out…', honk: 'Beep!', stolen: 'My car!',
    punch: 'Punch', enter: 'Enter', run: 'Run', exit: 'Exit', drift: 'Drift', horn: 'Horn',
    controlsPC: 'WASD move · Shift run · Space punch / drift · F enter/exit · H horn',
    controlsMobile: 'Left stick to move · right buttons to punch, enter cars, run',
    quality: 'Quality', high: 'High', low: 'Low', mute: 'Mute', sound: 'Sound', settings: 'Settings', close: 'Close',
    credit: 'Map data © OpenStreetMap contributors (ODbL)',
    tagline: 'Wander Markham, punch strangers, steal cars — watch out for the cops!',
    chase: 'The cops are after you!', escaped: 'You lost the cops',
  },
};
let lang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
export function setLang(l) { lang = l; }
export function getLang() { return lang; }
export const t = (k) => (DICT[lang] && DICT[lang][k]) || DICT.zh[k] || k;
