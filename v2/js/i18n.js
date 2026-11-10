// All player-facing text (zh + en). Brand names in the map are already parody names.
const T = {
  zh: {
    title: '万锦玩具城', sub: 'Project 905 · 重制版', start: '开始游戏', lang: 'English', loading: '正在搭建万锦…',
    help: '电脑：WASD 移动 · Shift 跑 · 空格 出拳 / 漂移 · F 上下车 · H 喇叭\n手机：左边摇杆，右边按钮（横着拿）',
    old: '回到旧版', punch: '拳', enter: '上车', run: '跑', drift: '漂移', exit: '下车', horn: '喇叭',
    wanted: '警察在追你！', losing: '快甩掉了…', escaped: '甩掉了！', busted: '被抓了！', bustedSub: '没事，换个地方接着逛',
    settings: '设置', sound: '声音', shadows: '阴影', sharp: '高清', on: '开', off: '关', close: '关闭', city: '万锦 Markham',
    s_help: ['救命啊！', '别打我！', '快跑！', '妈呀！'], s_fight: ['你干嘛！', '找打是吧！', '来啊！'], s_master: ['年轻人，耍大刀？', '让你三招。'],
    s_ouch: ['哎哟！', '疼疼疼…', '我的腰！'], s_gasp: ['天啊！', '打人啦！', '报警！'], s_stop: ['站住！', '别跑！', '警察！'], s_mycar: ['我的车！', '还我车！'], pow: ['砰！', '啪！', '咚！'],
  },
  en: {
    title: 'Markham Toy Town', sub: 'Project 905 · Remake', start: 'Start', lang: '中文', loading: 'Building Markham…',
    help: 'Desktop: WASD move · Shift run · Space punch / drift · F enter/exit · H horn\nPhone: stick on the left, buttons on the right (hold it sideways)',
    old: 'Back to the old version', punch: 'Punch', enter: 'Enter', run: 'Run', drift: 'Drift', exit: 'Exit', horn: 'Horn',
    wanted: 'Police are after you!', losing: 'Losing them…', escaped: 'You got away!', busted: 'Busted!', bustedSub: 'No worries, off you go again',
    settings: 'Settings', sound: 'Sound', shadows: 'Shadows', sharp: 'Sharp', on: 'On', off: 'Off', close: 'Close', city: '万锦 Markham',
    s_help: ['Help!', "Don't hit me!", 'Run!', 'Yikes!'], s_fight: ['Hey!', 'You asked for it!', 'Come on!'], s_master: ['Wrong person, kid.', "I'll give you three moves."],
    s_ouch: ['Ouch!', 'Owww…', 'My back!'], s_gasp: ['Oh no!', 'A fight!', 'Call the cops!'], s_stop: ['Stop!', 'Freeze!', 'Police!'], s_mycar: ['My car!', 'Give it back!'], pow: ['POW!', 'BAM!', 'BONK!'],
  },
};
export const i18n = {
  lang: 'zh',
  t(k) { return T[this.lang][k] ?? T.en[k] ?? k; },
  pick(k) { const a = this.t(k); return Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a; },
  toggle() { this.lang = this.lang === 'zh' ? 'en' : 'zh'; },
};
