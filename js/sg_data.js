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
  // v1.0 (D-87): signature traits of the great generals of the other eras
  bingsheng: ['兵圣', 'Sage of War', '攻击 +20%，计略更容易', 'Attack +20%, better stratagems'],
  rentu: ['人屠', 'The Butcher', '攻击 +25%', 'Attack +25%'],
  wuzu: ['魏武卒', 'Wei Infantry', '攻击 +10%，守城 +15%', 'Attack +10%, defence +15%'],
  wenzhong: ['稳重', 'Steady', '守城 +20%，攻击 +8%', 'Defence +20%, attack +8%'],
  bawang: ['霸王', 'The Hegemon', '单挑伤害 +35%，进攻时攻击 +20%', 'Duel damage +35%, attack +20% when attacking'],
  bingxian: ['兵仙', 'Immortal of War', '攻击 +25%', 'Attack +25%'],
  mousheng: ['谋圣', 'Sage of Plans', '攻击 +18%（计谋），计略更容易', 'Attack +18% (stratagems), better stratagems'],
  changsheng: ['常胜', 'Ever Victorious', '攻击 +15%，守城 +10%', 'Attack +15%, defence +10%'],
  guanjun: ['冠军侯', 'Champion Marquis', '进攻时攻击 +30%', 'Attack +30% when attacking'],
  xiliu: ['细柳营', 'Xiliu Camp', '守城 +20%，攻击 +10%', 'Defence +20%, attack +10%'],
  feishui: ['淝水', 'Fei River', '兵比敌少时攻击 +35%', 'Attack +35% when outnumbered'],
  baipao: ['白袍', 'White Robes', '进攻时攻击 +25%，兵少时 +15%', 'Attack +25% when attacking, +15% when outnumbered'],
  lanling: ['兰陵入阵', 'Prince of Lanling', '单挑伤害 +25%，攻击 +10%', 'Duel damage +25%, attack +10%'],
  junshen: ['军神', 'God of War', '攻击 +25%', 'Attack +25%'],
  tiance: ['天策', 'Heavenly Strategy', '进攻时攻击 +15%，内政 +15%，登用更容易', 'Attack +15% when attacking, development +15%, easier recruiting'],
  menshen: ['门神', 'Door God', '守城 +15%，单挑伤害 +15%', 'Defence +15%, duel damage +15%'],
  sanbanfu: ['三板斧', 'Three Axe Blows', '单挑伤害 +25%', 'Duel damage +25%'],
  zaizao: ['再造', 'Restorer', '守城 +20%，登用更容易', 'Defence +20%, easier recruiting'],
  niangzi: ['娘子军', 'Women\'s Army', '征兵 +30%，登用更容易', 'Drafting +30%, easier recruiting'],
  jingzhong: ['精忠', 'Utmost Loyalty', '攻击 +20%，忠诚高', 'Attack +20%, very loyal'],
  wudi: ['杨无敌', 'Invincible Yang', '单挑伤害 +20%，攻击 +10%', 'Duel damage +20%, attack +10%'],
  tianjiao: ['天骄', 'Son of Heaven', '进攻时攻击 +25%', 'Attack +25% when attacking'],
  kaiguo: ['开国', 'Founding General', '攻击 +15%，守城 +10%', 'Attack +15%, defence +10%'],
  changshiwan: ['常十万', 'Chang of 100,000', '兵比敌少时攻击 +35%，单挑伤害 +10%', 'Attack +35% when outnumbered, duel damage +10%'],
  yuanyang: ['鸳鸯阵', 'Mandarin Duck Formation', '攻击 +15%，守城 +15%', 'Attack +15%, defence +15%'],
  xinxue: ['心学', 'School of Mind', '攻击 +12%（计谋），计略更容易', 'Attack +12% (stratagems), better stratagems'],
  baigan: ['白杆兵', 'White Pole Army', '守城 +20%，单挑伤害 +10%', 'Defence +20%, duel damage +10%'],
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
  bingsheng: { atk: 0.2, plot: 0.15 }, rentu: { atk: 0.25 }, wuzu: { atk: 0.1, def: 0.15 }, wenzhong: { def: 0.2, atk: 0.08 },
  bawang: { duel: 0.35, raid: 0.2 }, bingxian: { atk: 0.25 }, mousheng: { atk: 0.18, plot: 0.25 }, changsheng: { atk: 0.15, def: 0.1 },
  guanjun: { raid: 0.3 }, xiliu: { def: 0.2, atk: 0.1 }, feishui: { few: 0.35 }, baipao: { raid: 0.25, few: 0.15 },
  lanling: { duel: 0.25, atk: 0.1 }, junshen: { atk: 0.25 }, tiance: { raid: 0.15, dev: 0.15, recruit: 0.2 }, menshen: { def: 0.15, duel: 0.15 },
  sanbanfu: { duel: 0.25 }, zaizao: { def: 0.2, recruit: 0.2 }, niangzi: { draft: 0.3, recruit: 0.15 }, jingzhong: { atk: 0.2, loyal: 20 },
  wudi: { duel: 0.2, atk: 0.1 }, tianjiao: { raid: 0.25 }, kaiguo: { atk: 0.15, def: 0.1 }, changshiwan: { few: 0.35, duel: 0.1 },
  yuanyang: { atk: 0.15, def: 0.15 }, xinxue: { atk: 0.12, plot: 0.2 }, baigan: { def: 0.2, duel: 0.1 },
};
// v0.8.1 (D-75): officers famous for stratagems are better at 计略 (rumours, fire)
for (const [k, v] of Object.entries({ shensuan: 0.2, guicai: 0.2, lianhuan: 0.15, qimou: 0.15, huoshen: 0.2, huoshao: 0.2, kurou: 0.1, yaoshu: 0.1, waijiao: 0.05 })) TRAIT_FX[k].plot = v;

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
// v1.0 (D-87) 万锦群英传: great generals of every era up to the mid-Qing (before 1840). Again our own
// estimates from the histories. [id, zh, en, 统率, 武力, 智力, 政治, trait, era, dynasty tag zh, en]
// eras: xq 先秦, qh 秦汉 (楚汉 and the two Han), st 晋隋唐, sy 宋元, mq 明清
const G2 = [
  ['fuhao', '妇好', 'Fu Hao', 88, 85, 75, 65, 'niangzi', 'xq', '商', 'Shang'],
  ['sunwu', '孙武', 'Sun Wu', 97, 62, 100, 78, 'bingsheng', 'xq', '吴', 'Wu'],
  ['wuzixu', '伍子胥', 'Wu Zixu', 88, 80, 90, 78, 'ganglie', 'xq', '吴', 'Wu'],
  ['wuqi', '吴起', 'Wu Qi', 96, 80, 92, 88, 'wuzu', 'xq', '魏', 'Wei'],
  ['sunbin', '孙膑', 'Sun Bin', 90, 30, 98, 75, 'shensuan', 'xq', '齐', 'Qi'],
  ['tiandan', '田单', 'Tian Dan', 85, 70, 92, 78, 'huoshen', 'xq', '齐', 'Qi'],
  ['yueyi', '乐毅', 'Yue Yi', 93, 78, 88, 82, 'qimou', 'xq', '燕', 'Yan'],
  ['baiqi', '白起', 'Bai Qi', 99, 90, 92, 40, 'rentu', 'xq', '秦', 'Qin'],
  ['wangjian', '王翦', 'Wang Jian', 97, 85, 90, 72, 'wenzhong', 'xq', '秦', 'Qin'],
  ['lianpo', '廉颇', 'Lian Po', 92, 88, 75, 60, 'tiebi', 'xq', '赵', 'Zhao'],
  ['limu', '李牧', 'Li Mu', 95, 84, 90, 70, 'shouye', 'xq', '赵', 'Zhao'],
  ['xiangyu', '项羽', 'Xiang Yu', 95, 100, 60, 30, 'bawang', 'qh', '楚', 'Chu'],
  ['fanzeng', '范增', 'Fan Zeng', 70, 30, 93, 80, 'qimou', 'qh', '楚', 'Chu'],
  ['yingbu', '英布', 'Ying Bu', 85, 93, 50, 30, 'xianzhen', 'qh', '楚', 'Chu'],
  ['longju', '龙且', 'Long Ju', 80, 90, 40, 30, 'yongmeng', 'qh', '楚', 'Chu'],
  ['zhonglimo', '钟离眜', 'Zhongli Mo', 82, 86, 55, 40, 'shouye', 'qh', '楚', 'Chu'],
  ['liubang', '刘邦', 'Liu Bang', 80, 65, 82, 90, 'renmin', 'qh', '汉', 'Han'],
  ['hanxin', '韩信', 'Han Xin', 100, 80, 95, 60, 'bingxian', 'qh', '汉', 'Han'],
  ['zhangliang', '张良', 'Zhang Liang', 85, 30, 100, 90, 'mousheng', 'qh', '汉', 'Han'],
  ['xiaohe', '萧何', 'Xiao He', 60, 25, 92, 100, 'wangzuo', 'qh', '汉', 'Han'],
  ['fankuai', '樊哙', 'Fan Kuai', 75, 92, 40, 30, 'yongmeng', 'qh', '汉', 'Han'],
  ['pengyue', '彭越', 'Peng Yue', 82, 82, 72, 50, 'shensu', 'qh', '汉', 'Han'],
  ['zhouyafu', '周亚夫', 'Zhou Yafu', 94, 80, 85, 65, 'xiliu', 'qh', '汉', 'Han'],
  ['weiqing', '卫青', 'Wei Qing', 98, 88, 85, 75, 'changsheng', 'qh', '汉', 'Han'],
  ['huoqubing', '霍去病', 'Huo Qubing', 96, 95, 78, 40, 'guanjun', 'qh', '汉', 'Han'],
  ['liguang', '李广', 'Li Guang', 85, 92, 60, 45, 'feijiang', 'qh', '汉', 'Han'],
  ['mayuan', '马援', 'Ma Yuan', 90, 85, 80, 70, 'ganglie', 'qh', '汉', 'Han'],
  ['banchao', '班超', 'Ban Chao', 85, 80, 88, 85, 'waijiao', 'qh', '汉', 'Han'],
  ['xiexuan', '谢玄', 'Xie Xuan', 92, 75, 88, 75, 'feishui', 'st', '晋', 'Jin'],
  ['chenqingzhi', '陈庆之', 'Chen Qingzhi', 96, 60, 90, 70, 'baipao', 'st', '梁', 'Liang'],
  ['gaochanggong', '高长恭', 'Gao Changgong', 90, 94, 70, 55, 'lanling', 'st', '齐', 'Qi'],
  ['hulvguang', '斛律光', 'Hulü Guang', 92, 90, 72, 55, 'shenshe', 'st', '齐', 'Qi'],
  ['yangsu', '杨素', 'Yang Su', 93, 85, 88, 75, 'danlve', 'st', '隋', 'Sui'],
  ['hanqinhu', '韩擒虎', 'Han Qinhu', 88, 88, 70, 55, 'yongmeng', 'st', '隋', 'Sui'],
  ['lishimin', '李世民', 'Li Shimin', 95, 85, 92, 95, 'tiance', 'st', '唐', 'Tang'],
  ['lijing', '李靖', 'Li Jing', 100, 82, 95, 80, 'junshen', 'st', '唐', 'Tang'],
  ['liji', '李勣', 'Li Ji', 92, 80, 88, 75, 'qimou', 'st', '唐', 'Tang'],
  ['qinqiong', '秦琼', 'Qin Qiong', 82, 94, 60, 50, 'menshen', 'st', '唐', 'Tang'],
  ['yuchigong', '尉迟恭', 'Yuchi Gong', 80, 95, 45, 40, 'ganglie', 'st', '唐', 'Tang'],
  ['chengyaojin', '程咬金', 'Cheng Yaojin', 70, 88, 40, 35, 'sanbanfu', 'st', '唐', 'Tang'],
  ['pingyang', '平阳公主', 'Princess Pingyang', 85, 75, 80, 70, 'niangzi', 'st', '唐', 'Tang'],
  ['sudingfang', '苏定方', 'Su Dingfang', 94, 88, 78, 55, 'shensu', 'st', '唐', 'Tang'],
  ['xuerengui', '薛仁贵', 'Xue Rengui', 90, 95, 65, 50, 'shenshe', 'st', '唐', 'Tang'],
  ['guoziyi', '郭子仪', 'Guo Ziyi', 96, 75, 85, 88, 'zaizao', 'st', '唐', 'Tang'],
  ['liguangbi', '李光弼', 'Li Guangbi', 95, 80, 85, 60, 'tiebi', 'st', '唐', 'Tang'],
  ['yangye', '杨业', 'Yang Ye', 90, 93, 70, 55, 'wudi', 'sy', '宋', 'Song'],
  ['diqing', '狄青', 'Di Qing', 90, 92, 72, 55, 'xianzhen', 'sy', '宋', 'Song'],
  ['zongze', '宗泽', 'Zong Ze', 85, 65, 82, 85, 'shouye', 'sy', '宋', 'Song'],
  ['yuefei', '岳飞', 'Yue Fei', 100, 95, 85, 70, 'jingzhong', 'sy', '宋', 'Song'],
  ['hanshizhong', '韩世忠', 'Han Shizhong', 92, 90, 78, 60, 'danlve', 'sy', '宋', 'Song'],
  ['lianghongyu', '梁红玉', 'Liang Hongyu', 82, 80, 82, 65, 'ganglie', 'sy', '宋', 'Song'],
  ['jinwuzhu', '金兀术', 'Jin Wuzhu', 90, 90, 75, 60, 'shensu', 'sy', '金', 'Jin'],
  ['chengjisihan', '成吉思汗', 'Genghis Khan', 100, 85, 90, 85, 'tianjiao', 'sy', '元', 'Yuan'],
  ['muhuali', '木华黎', 'Muqali', 95, 88, 85, 75, 'danlve', 'sy', '元', 'Yuan'],
  ['subutai', '速不台', 'Subutai', 98, 88, 88, 55, 'shensu', 'sy', '元', 'Yuan'],
  ['boyan', '伯颜', 'Bayan', 93, 80, 88, 80, 'qimou', 'sy', '元', 'Yuan'],
  ['xuda', '徐达', 'Xu Da', 99, 88, 90, 80, 'kaiguo', 'mq', '明', 'Ming'],
  ['changyuchun', '常遇春', 'Chang Yuchun', 92, 97, 60, 40, 'changshiwan', 'mq', '明', 'Ming'],
  ['yuqian', '于谦', 'Yu Qian', 88, 50, 90, 92, 'tiebi', 'mq', '明', 'Ming'],
  ['wangyangming', '王阳明', 'Wang Yangming', 90, 60, 98, 90, 'xinxue', 'mq', '明', 'Ming'],
  ['qijiguang', '戚继光', 'Qi Jiguang', 96, 85, 88, 75, 'yuanyang', 'mq', '明', 'Ming'],
  ['yudayou', '俞大猷', 'Yu Dayou', 92, 88, 80, 60, 'shouye', 'mq', '明', 'Ming'],
  ['qinliangyu', '秦良玉', 'Qin Liangyu', 90, 85, 78, 70, 'baigan', 'mq', '明', 'Ming'],
  ['yuanchonghuan', '袁崇焕', 'Yuan Chonghuan', 90, 70, 85, 70, 'tiebi', 'mq', '明', 'Ming'],
  ['zhengchenggong', '郑成功', 'Koxinga', 92, 82, 82, 75, 'jinfan', 'mq', '明', 'Ming'],
  ['shilang', '施琅', 'Shi Lang', 90, 75, 85, 70, 'jinfan', 'mq', '清', 'Qing'],
  ['niangengyao', '年羹尧', 'Nian Gengyao', 92, 80, 82, 60, 'shensu', 'mq', '清', 'Qing'],
  ['yuezhongqi', '岳钟琪', 'Yue Zhongqi', 88, 85, 78, 65, 'yongmeng', 'mq', '清', 'Qing'],
  ['zhaohui', '兆惠', 'Zhao Hui', 90, 82, 80, 60, 'shouye', 'mq', '清', 'Qing'],
  ['fukangan', '福康安', 'Fuk\'anggan', 88, 75, 78, 70, 'mingmen', 'mq', '清', 'Qing'],
];
const SG_TAG = { shu: ['蜀', 'Shu'], wei: ['魏', 'Wei'], wu: ['吴', 'Wu'], qun: ['群', 'Qun'] };
// era -> [zh, en, short zh, short en] (the short ones label the tabs of the 将 page)
export const ERAS = { sg: ['三国', 'Three Kingdoms', '三国', '3 Kgdms'], xq: ['先秦', 'Pre-Qin', '先秦', 'Pre-Qin'], qh: ['秦汉', 'Qin & Han', '秦汉', 'Qin-Han'], st: ['晋隋唐', 'Jin to Tang', '隋唐', 'Jin-Tang'], sy: ['宋元', 'Song & Yuan', '宋元', 'Song-Yuan'], mq: ['明清', 'Ming & Qing', '明清', 'Ming-Qing'] };
export const GENERALS = Object.fromEntries([
  ...G.map(([id, zh, en, lead, war, int, pol, trait, k]) => [id, { id, zh, en, lead, war, int, pol, trait, k, era: 'sg', tag: SG_TAG[k] }]),
  ...G2.map(([id, zh, en, lead, war, int, pol, trait, era, tz, te]) => [id, { id, zh, en, lead, war, int, pol, trait, k: era, era, tag: [tz, te] }]),
]);
export const SANGUO_IDS = G.map((g) => g[0]);
export const GEN_IDS = Object.keys(GENERALS);
// the one character on a portrait: the last of the name, or the first when another officer already has it
{
  const used = new Set();
  for (const id of GEN_IDS) {
    const g = GENERALS[id], cand = [g.zh.slice(-1), g.zh[0], ...g.zh];
    g.glyph = cand.find((c) => !used.has(c)) || g.zh.slice(-1);
    used.add(g.glyph);
  }
}

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
  // v1.0 (D-87): the other eras, and a few across the ages
  { id: 'zhanguo', zh: '战国四将', en: 'Four Generals of the Warring States', m: ['baiqi', 'wangjian', 'lianpo', 'limu'], need: 2, scope: 'faction', fx: { atk: 0.12 } },
  { id: 'sunwu2', zh: '孙吴兵法', en: 'The Art of War', m: ['sunwu', 'wuqi', 'sunbin'], need: 2, scope: 'faction', fx: { atk: 0.1, search: 0.1 } },
  { id: 'hanchu', zh: '汉初三杰', en: 'Three Heroes of Early Han', m: ['zhangliang', 'xiaohe', 'hanxin'], need: 2, scope: 'faction', fx: { dev: 0.2, atk: 0.08 } },
  { id: 'chujun', zh: '西楚霸业', en: 'The Hegemon of Western Chu', m: ['xiangyu', 'fanzeng', 'yingbu', 'longju', 'zhonglimo'], need: 2, scope: 'army', fx: { atk: 0.15 } },
  { id: 'weihuo', zh: '卫霍', en: 'Wei and Huo', m: ['weiqing', 'huoqubing'], need: 2, scope: 'army', fx: { atk: 0.2 } },
  { id: 'lingyan', zh: '凌烟阁', en: 'Pavilion of Lingyan', m: ['lishimin', 'lijing', 'liji', 'qinqiong', 'yuchigong', 'chengyaojin'], need: 3, scope: 'faction', fx: { atk: 0.12 } },
  { id: 'menshen2', zh: '门神', en: 'The Door Gods', m: ['qinqiong', 'yuchigong'], need: 2, scope: 'army', fx: { def: 0.25 } },
  { id: 'hanliang', zh: '韩梁夫妻', en: 'Han and Liang', m: ['hanshizhong', 'lianghongyu'], need: 2, scope: 'army', fx: { atk: 0.15, def: 0.1 } },
  { id: 'mengu', zh: '蒙古铁骑', en: 'Mongol Horsemen', m: ['chengjisihan', 'muhuali', 'subutai', 'boyan'], need: 2, scope: 'army', fx: { atk: 0.15 } },
  { id: 'xuchang', zh: '徐常', en: 'Xu and Chang', m: ['xuda', 'changyuchun'], need: 2, scope: 'army', fx: { atk: 0.2 } },
  { id: 'qiyu', zh: '抗倭双雄', en: 'The Pirate Fighters', m: ['qijiguang', 'yudayou'], need: 2, scope: 'army', fx: { def: 0.2, atk: 0.1 } },
  { id: 'nvjiang', zh: '巾帼英雄', en: 'Heroines', m: ['fuhao', 'pingyang', 'lianghongyu', 'qinliangyu', 'zhurong'], need: 2, scope: 'faction', fx: { def: 0.1, atk: 0.08 } },
  { id: 'baipao2', zh: '白袍将军', en: 'The White-robed Generals', m: ['chenqingzhi', 'xuerengui'], need: 2, scope: 'army', fx: { atk: 0.15 } },
  { id: 'feijiang2', zh: '飞将', en: 'The Flying Generals', m: ['liguang', 'lvbu'], need: 2, scope: 'faction', fx: { duel: 0.15 } },
];

// rivals: when a member of one side meets a member of the other in battle, a duel is very likely
export const RIVALS = [
  { a: ['guanyu'], b: ['lvmeng'], zh: '败走麦城之仇', en: 'The grudge of Maicheng' },
  { a: ['zhangliao'], b: ['sunquan', 'ganning', 'taishici'], zh: '逍遥津', en: 'Xiaoyao Ford' },
  { a: ['lvbu'], b: ['liubei', 'guanyu', 'zhangfei'], zh: '三英战吕布', en: 'Three Heroes vs Lü Bu' },
  { a: ['machao'], b: ['caocao', 'xuchu'], zh: '割须弃袍', en: 'Cut beard, dropped robe' },
  { a: ['zhugeliang'], b: ['simayi', 'zhouyu'], zh: '斗智', en: 'Battle of wits' },
  { a: ['lvbu'], b: ['dongzhuo'], zh: '凤仪亭', en: 'Phoenix Pavilion' },
  { a: ['xiangyu'], b: ['liubang', 'hanxin'], zh: '楚汉相争', en: 'Chu against Han' },
  { a: ['baiqi'], b: ['lianpo', 'limu'], zh: '长平之战', en: 'Changping' },
  { a: ['yuefei'], b: ['jinwuzhu'], zh: '直捣黄龙', en: 'On to Huanglong' },
  { a: ['zhengchenggong'], b: ['shilang'], zh: '海峡恩怨', en: 'Across the strait' },
  { a: ['guanyu'], b: ['qinqiong'], zh: '关公战秦琼', en: 'Guan Yu fights Qin Qiong' },
  { a: ['hanxin'], b: ['lijing'], zh: '兵仙对军神', en: 'Two gods of war' },
  { a: ['lvbu'], b: ['xiangyu'], zh: '天下无双', en: 'Peerless' },
  { a: ['huoqubing'], b: ['chengjisihan'], zh: '漠北争雄', en: 'North of the desert' },
];

// the classic map. The 12 cities and the passes: [id, zh, en, game x, game z] (positions in maps/markham.json game
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
// v0.8.1 (D-75): the passes (关 / 隘口) are real Markham parks that sit across a road between two
// cities: river valleys and woods you have to get through. They have no people (no development,
// drafting or searching) but strong walls; troops get there by moving in. Toogood Park, by the
// pond in Unionville, is the big one, "Toogood 虎牢关", guarded at the start by the strongest
// officer still at large. (Wismer Park is north of the map, so it is not one of them.)
const P = [
  ['p_jb', 'John Button 关', 'John Button Pass', -1193, -798, 0],
  ['p_tg', 'Toogood 虎牢关', 'Toogood Tiger Pass', -110, -597, 1],
  ['p_ad', 'Austin Drive 关', 'Austin Drive Pass', 510, -481, 0],
  ['p_md', 'Milne Dam 关', 'Milne Dam Pass', 1433, -200, 0],
  ['p_mm', 'Milliken 关', 'Milliken Pass', -76, 550, 0],
];
export function elevAt(x, z) { // bilinear in the real elevation grid
  const fx = Math.min(ELEV.nx - 1.001, Math.max(0, (x - ELEV.x0) / ELEV.step)), fz = Math.min(ELEV.nz - 1.001, Math.max(0, (z - ELEV.z0) / ELEV.step));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, h = (a, b) => ELEV.h[b * ELEV.nx + a];
  return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
}
// v0.8.2 (D-76): 补给站 supply depots = the cities with a real big mall or warehouse store (OSM shop=mall /
// wholesale within ~250 game m, names are the town's puns). A depot feeds its own supply line like a capital.
export const DEPOTS = {
  btv: ['王府景 Kingz Square', 'Kingz Square'], wdb: ['Costgo', 'Costgo'],
  mkv: ['Markvile Mall', 'Markvile Mall'], pac: ['大古广场 Pacifick Mall', 'Pacifick Mall'],
};
// links = supply lines along real roads: [a, b, road, crosses the Rouge River (渡河), 驿站]. The river flags
// are checked against maps/markham.json by tests/unit/sg.test.js.
// v0.8.2 (D-76): 驿站 relay stations = real gas stations (OSM amenity=fuel) on that road, partway between the
// two ends: [pun brand name, where along the road 0..1]. Armies on a relay road arrive fed and fuelled.
const CLASSIC_LINKS = [
  ['btv', 'wdb', 'Woodbine Ave', 1], ['btv', 'p_jb', '16th Ave', 0], ['p_jb', 'civ', '16th Ave', 0], ['wdb', 'civ', 'Hwy 7', 1],
  ['wdb', 'esn', 'Woodbine Ave', 0, ['Ezzo', 0.22]], ['civ', 'dtm', 'Enterprise Blvd', 1], ['civ', 'p_tg', 'Hwy 7', 0], ['p_tg', 'unv', 'Hwy 7', 0],
  ['dtm', 'unv', 'Main St Unionville', 1], ['dtm', 'hag', 'Kennedy Rd', 0], ['dtm', 'esn', 'Warden Ave', 0],
  ['esn', 'pac', 'Steeles Ave E', 0, ['Petro-Kanada', 0.4]], ['esn', 'p_mm', '14th Ave', 0], ['p_mm', 'hag', '14th Ave', 0], ['hag', 'pac', 'Kennedy Rd', 0],
  ['hag', 'mil', '14th Ave', 0], ['pac', 'mil', 'Steeles Ave E', 0, ['Globle Gas', 0.5]], ['mil', 'arm', 'Denison St', 0], ['mil', 'mkv', 'McCowan Rd', 1, ['Petro-Kanada', 0.37]],
  ['unv', 'p_ad', 'Hwy 7', 0, ['Petro-Kanada', 0.75]], ['p_ad', 'mkv', 'Hwy 7', 0], ['unv', 'ray', '16th Ave', 0], ['mkv', 'ray', 'Hwy 7', 0],
  ['ray', 'p_md', 'Markham Rd', 0], ['p_md', 'arm', 'Markham Rd', 1, ['Canadian Tyre Gas', 0.56]],
];
export const CLASSIC = {
  key: 'classic',
  nodes: [
    ...C.map(([id, zh, en, x, z, v]) => [id, zh, en, x, z, v, 0, 0, DEPOTS[id] || null]),
    ...P.map(([id, zh, en, x, z, big]) => [id, zh, en, x, z, 0, 1, big, null]),
  ],
  links: CLASSIC_LINKS,
};

// v0.9 (D-77): the board is part of the game. Every new game builds its own map (js/sg_engine.js genMap,
// drawing real places from js/sg_sites.js); the layout above is the fixed "classic" map (tests, old saves).
// The tables below always describe the map in play: useMap() refills them in place, so every module that
// imported them sees the current board.
export const CITIES = {};
export const CITY_IDS = [];   // what you need to unite Markham
export const PASS_IDS = [];
export const NODE_IDS = [];
export const LINKS = [];
export const ADJ = {};
let mapKey = null;
export const currentMapKey = () => mapKey;
// def = { key, nodes: [[id, zh, en, x, z, valley, pass, big, depot [zh, en] | null]], links: [[a, b, road, river, station | null]] }
export function useMap(def) {
  if (def.key === mapKey) return;
  for (const k of Object.keys(CITIES)) delete CITIES[k];
  for (const k of Object.keys(ADJ)) delete ADJ[k];
  CITY_IDS.length = 0; PASS_IDS.length = 0; NODE_IDS.length = 0; LINKS.length = 0;
  for (const [id, zh, en, x, z, valley, pass, big, depot] of def.nodes) {
    CITIES[id] = { id, zh, en, x, z, valley: !!valley, pass: !!pass, big: !!big, depot: depot || null, elev: Math.round(elevAt(x, z)) };
    (pass ? PASS_IDS : CITY_IDS).push(id);
    ADJ[id] = [];
  }
  NODE_IDS.push(...CITY_IDS, ...PASS_IDS);
  for (const l of def.links) {
    const [x, y, road, river, st] = l;
    LINKS.push(l);
    const station = st ? st[0] : null;
    ADJ[x].push({ c: y, road, river: !!river, station }); ADJ[y].push({ c: x, road, river: !!river, station });
  }
  mapKey = def.key;
}
useMap(CLASSIC);

// faction colours (player first), chosen so they also differ in lightness
export const FACTION_COLORS = ['#2f7de1', '#d64545', '#7c55c9', '#e8892b'];
export const NEUTRAL_COLOR = '#9aa0a6';

// ---------------------------------------------------------------- treasures (v1.1, D-97)
// Blind-box treasures found by searching. One per officer; fx adds to his stats (hp / sp: duel stamina / spirit).
// Each game hides `itemCount` of them. kind picks the card colour; the last four are Markham's own.
export const ITEMS = {
  fangtian: { zh: '方天画戟', en: 'Sky Piercer Halberd', glyph: '戟', kind: 'weapon', tier: 'UR', fx: { war: 10 } },
  chitu: { zh: '赤兔马', en: 'Red Hare', glyph: '马', kind: 'horse', tier: 'UR', fx: { lead: 10 } },
  sunzi: { zh: '孙子兵法', en: 'The Art of War', glyph: '兵', kind: 'book', tier: 'UR', fx: { int: 10 } },
  yuxi: { zh: '传国玉玺', en: 'Imperial Seal', glyph: '玺', kind: 'seal', tier: 'UR', fx: { pol: 10 } },
  qinglong: { zh: '青龙偃月刀', en: 'Green Dragon Blade', glyph: '刀', kind: 'weapon', tier: 'SSR', fx: { war: 8 } },
  zhangba: { zh: '丈八蛇矛', en: 'Serpent Spear', glyph: '矛', kind: 'weapon', tier: 'SSR', fx: { war: 7 } },
  yitian: { zh: '倚天剑', en: 'Heaven Sword', glyph: '剑', kind: 'weapon', tier: 'SSR', fx: { war: 6, lead: 4 } },
  wumu: { zh: '武穆遗书', en: "Wumu's Legacy", glyph: '穆', kind: 'book', tier: 'SSR', fx: { lead: 8 } },
  taiping: { zh: '太平要术', en: 'The Way of Peace', glyph: '术', kind: 'book', tier: 'SSR', fx: { int: 7 } },
  chunqiu: { zh: '春秋左传', en: 'Spring and Autumn Annals', glyph: '传', kind: 'book', tier: 'SSR', fx: { pol: 7 } },
  qinggang: { zh: '青釭剑', en: 'Blue Steel Sword', glyph: '釭', kind: 'weapon', tier: 'SR', fx: { war: 5 } },
  cixiong: { zh: '雌雄双股剑', en: 'Twin Swords', glyph: '双', kind: 'weapon', tier: 'SR', fx: { war: 4, lead: 3 } },
  qixing: { zh: '七星宝刀', en: 'Seven Star Dagger', glyph: '星', kind: 'weapon', tier: 'SR', fx: { war: 4 } },
  dilu: { zh: '的卢马', en: 'Dilu', glyph: '卢', kind: 'horse', tier: 'SR', fx: { lead: 6 } },
  jueying: { zh: '绝影', en: 'Shadowless', glyph: '影', kind: 'horse', tier: 'SR', fx: { lead: 5 } },
  mengde: { zh: '孟德新书', en: "Mengde's New Book", glyph: '新', kind: 'book', tier: 'SR', fx: { int: 4, lead: 4 } },
  heshibi: { zh: '和氏璧', en: 'Jade of He', glyph: '璧', kind: 'seal', tier: 'SR', fx: { pol: 6 } },
  qingnang: { zh: '青囊书', en: 'Book of Healing', glyph: '囊', kind: 'book', tier: 'SR', fx: { hp: 25 } },
  boba: { zh: '大杯珍珠奶茶', en: 'Large Bubble Tea', glyph: '🧋', kind: 'local', tier: 'SR', fx: { sp: 30 } },
  donut: { zh: '一打甜甜圈', en: 'A Dozen Donuts', glyph: '🍩', kind: 'local', tier: 'SR', fx: { hp: 15, pol: 3 } },
  costgo: { zh: 'Costgo 会员卡', en: 'Costgo Membership', glyph: '💳', kind: 'local', tier: 'SR', fx: { pol: 5, int: 3 } },
  viva: { zh: 'Viva 公交月票', en: 'Viva Monthly Pass', glyph: '🚌', kind: 'local', tier: 'SR', fx: { lead: 4 } },
};
export const ITEM_IDS = Object.keys(ITEMS);

