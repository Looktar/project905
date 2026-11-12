// 万锦群英传 (D-73, renamed in v1.0 D-87; was 万锦三国志): the strategy screen. The real Markham minimap is the board; 12 cities sit on
// it, linked by the real roads (supply lines). Tap a city, give it an order, end the month; duels
// with your generals are played by you (猛攻 / 防守 / 必杀), new generals are revealed like blind boxes.
// Rules live in sg_engine.js; this file is DOM + canvas only. The game state is saved in localStorage.
import { CFG } from './config.js';
import { t, getLang, extend } from './i18n.js';
import { toGamePoint, toGameDelta } from './input.js';
import * as E from './sg_engine.js';
import * as sfx from './audio.js';
import { ITEMS, GENERALS, ERAS, TRAITS, CITIES, NODE_IDS, PASS_IDS, ADJ, LINKS, BONDS, NEUTRAL_COLOR } from './sg_data.js';
import { drawCity, cityKind } from './sg_art.js';
import { BIOS } from './sg_bios.js';
import { portraitURL } from './sg_portrait.js';
import { bakePaper, woodTile } from './sg_paper.js';

extend({
  sgStart: '⚔ 万锦群英传', sgTitle: '万锦群英传', sgDateMix: '群英{y}年 {m}月', sgEnd: '结束本月', sgDate: '建安{y}年 {m}月', sgGold: '金', sgFood: '粮', sgTroops: '兵', sgCities: '城',
  sgLog: '战报', sgMenu: '菜单', sgMusicOn: '🎵 音乐：开', sgMusicOff: '🎵 音乐：关', sgBack: '回到万锦街头', sgNew: '重新开局', sgModeQ: '新的一局：选武将', sgModeMix: '历代混战', sgModeMixS: '从先秦到明清的 118 位名将里抽 32 位', sgModeSg: '只三国', sgModeSgS: '从 48 位三国武将里抽 32 位', sgNewQ: '重新开局会换一批盲盒，当前进度会丢失。确定吗？', sgHelp: '玩法说明', sgHide: '收起面板，看全图', sgContinue: '继续',
  sgYou: '你', sgUnclaimed: '空城', sgArmy: '{n}军',
  sgCmdDev: '内政', sgCmdDevS: '开发 +金粮', sgCmdDraft: '征兵', sgCmdDraftS: '花金换兵', sgCmdSearch: '搜索', sgCmdSearchS: '找在野武将', sgCmdMove: '调动', sgCmdMoveS: '兵将去邻城',
  sgCmdMarch: '出征', sgCmdMarchS: '攻打邻城', sgCmdRest: '待命', sgCmdFort: '筑城', sgCmdFortS: '城防 +', sgCmdPlot: '计略', sgRumor: '流言', sgRumorS: '敌兵逃散', sgFire: '火计', sgFireS: '烧城防', sgChance: '成功 {n}%', sgPickKind: '选计略，再选目标', sgRumoured: '传闻在这里：{g}', sgWinter: '冬天下雪：进攻 −10%', sgHarvestNote: '九月秋收：粮翻几倍', sgOrder: '本月命令', sgPickTarget: '点地图上发光的城池选目标', sgCancel: '取消',
  sgTroopsSend: '出兵', sgGensSend: '带哪些武将', sgNoGen: '这里没有武将，下不了命令。从邻城调一位武将过来。', sgCut: '断粮！连不回本城：没有收入，每月掉兵',
  sgCap: '本城', sgDev: '开发', sgDef: '城防', sgGarrison: '驻守武将', sgNone: '没有', sgRumour: '在野传闻', sgRumourN: '{n} 位', sgRoad: '粮道',
  sgOwner: '势力', sgYourSide: '你的势力', sgPickCity: '点城池查看、下命令。和本城连成一片的城才有粮道，才能出征。',
  sgBonds: '羁绊', sgBondOn: '已激活', sgAllGens: '全部武将',
  sgReport: '本月急报', sgQuiet: '这个月很太平。', sgBlind: '开盲盒！', sgBlindStart: '开局盲盒', sgJoined: '{g} 加入了你的势力！', sgRecruited: '{g} 被你俘虏后归降了！',
  sgDuel: '单挑！', sgDuelVs: '{a} 对 {d}', sgAtk: '猛攻', sgDefM: '防守', sgSkill: '必杀', sgDuelRule: '猛攻克必杀 · 必杀破防守 · 防守挡猛攻（反击）', sgLooksatk: '看样子要猛攻', sgLooksdef: '看样子要防守', sgLooksskill: '看样子要放必杀',
  sgTrustOk: '看破：你的智力 {a} 不低于对方的 {b}，这个架势一定是真的', sgTrustWarn: '对方智力 {b} 比你的 {a} 高：约 {n}% 的可能是佯攻',
  sgSpirit: '斗志', sgSkillCost: '{n} 斗志', sgDuelAuto: '交给电脑打', sgKoGap: '武力悬殊：{g} 一击就能打倒对手！',
  sgRoundWon: '读对了！', sgRoundLost: '吃亏了…', sgRoundTie: '势均力敌', sgFeint: '（佯攻！）',
  sgDuelWin: '{g} 赢了单挑！', sgDuelDraw: '不分胜负！', sgRound: '第 {n} 回合', sgMoves: '你：{a} · 对方：{d}', sgHit: '{g} 受到 {n} 伤害', sgRival: '宿敌相见：{r}',
  sgWin: '统一万锦！', sgWinS: '用了 {n} 个月，万锦尽归你手。', sgLose: '势力覆灭…', sgLoseS: '你在万锦撑了 {n} 个月。再来一局，换一批盲盒！', sgAgain: '再来一局',
  sgRivals: '对手', sgIntro: '{a}、{b}、{c} 也在争夺万锦。开局各占一城，8 座空城等人去拿。这一局的地图是随机抽的真实地点，{p}有猛将把守。', sgOrders: '本月命令：{n}/{m} 位武将', sgAuto: '委任', sgAutoT: '空闲武将自动安排（内政、征兵、搜索、筑城，不出征）', sgAutoDone: '已给 {n} 位空闲武将安排了工作', sgAutoNone: '没有空闲武将了',
  sgPass: '关隘', sgPassNote: '隘口是真实的公园（河谷、树林），卡在两座城之间的路上。没有百姓：不能内政、征兵、搜索，但城防极高。调兵进来驻守，就能挡住这条路。', sgBigPass: '万锦虎牢：这一局最坚固的隘口',
  sgTerrStation: '驿站 +{n}%', sgStation: '{n}', sgDepot: '补给站（{n}）：本身就是粮源，连得上它的城都不断粮；粮 +{f}%', sgGuard: '守关猛将', sgElev: '海拔', sgValley: '胭脂河沃野：粮 +40%', sgWalls: '城防加成', sgTerrRiver: '渡河 −{n}%', sgTerrUp: '仰攻 −{n}%', sgTerrDown: '居高临下 +{n}%',
  sgTargets: '目标（也可以点地图）', sgOfficersBtn: '武将', sgGarrisonCard: '守军', sgCmdIntercept: '截击', sgFxField: '野战大胜！', sgFxFieldLost: '野战败退…', sgArmyChip: '{f} {n} → {to}', sgMaxLead: '≤{n}兵', sgPickArmy: '选要截击的敌军（经过本城的路上）', evField: '{w} 在 {c} 附近野战击败 {l}：{lw} 损失 {a}，{ll} 损失 {b}', evIntercept: '{g} 从 {c} 出城截击 {f}', sgOddsA: '大胜', sgOddsB: '有利', sgOddsC: '五五开', sgOddsD: '不利', sgFxTake: '攻下！', sgFxLost: '失守！', sgFxHeld: '守住了！', sgFxRepelled: '没打下来…', sgMonths: '{n} 个月', sgOnRoad: '行军中', sgEta: '{n} 个月后到', sgEtaNow: '本月到', sgIncoming: '敌军来袭', sgArmyTo: '{g} · {n} 兵 → {to} · {eta}', sgMarching: '行军中 → {to}（{eta}）', sgOfficers: '武将命令', sgMoveTroops: '带兵', sgGoldLeft: '还剩 {n} 金', sgIdleN: '{n} 位待命',
  evDev: '{c}：{g} 内政，开发 +{n}', evDraft: '{c}：{g} 征兵 +{n}', evFort: '{c}：{g} 修筑城防 +{n}', evSkip: '{g} 的命令没能执行（钱、兵不够或情况变了）', evTakePass: '{f} 攻破了 {c}！',
  evRumorOk: '{g} 在 {to} 散布流言：{n} 名守兵逃走了', evRumorNo: '{g} 在 {to} 的流言被识破了', evFireOk: '{g} 火烧 {to}：城防 −{n}', evFireNo: '{g} 对 {to} 的火计没烧起来',
  ev_nightmarket: '{c} 夜市人山人海，{f}多收 {n} 金', ev_bumper: '{c} 大丰收，{f}多收 {n} 粮', ev_volunteers: '{c} 来了 {n} 名义勇军', ev_merchant: '商队路过，{f}多赚 {n} 金',
  ev_blizzard: '{c} 暴风雪，冻跑了 {n} 兵', ev_icestorm: '{c} 遭遇冰暴，城防 −{n}', ev_flood: '胭脂河涨水淹了 {c}：开发 −4，兵 −{n}', ev_riot: '{c} 民变，兵 −{n}',
  ev_sighting: '传闻：{g} 藏在 {c}', ev_cny: '春节庙会！各家每座城多收 {n} 金', evHarvest: '九月秋收，粮仓满了！', evFound: '{c}：{by} 找到了在野武将 {g}！', evFoundAI: '{f} 在 {c} 找到了 {g}',
  evTreasure: '{c}：没找到人，捡到 {n} 金', evNothing: '{c}：搜了一圈，什么也没找到', evMove: '{g}：{c} → {to}，带兵 {n}，路上 {m} 个月', evArrive: '{g} 带 {n} 兵到达 {c}', evBlocked: '{g}：去 {to} 的路被 {c} 截断，就地攻打 {c}',
  evMarch: '{f} 从 {c} 出兵 {n} 攻打 {to}，{m} 个月后到', evDuel: '单挑 {a} 对 {d}：{w}', evDuelDraw: '平手', evDuelWon: '{g} 胜',
  evTake: '{f} 攻下了 {c}！', evRepel: '{c} 挡住了 {f} 的进攻', evFlee: '{g} 逃到了 {c}', evRecruit: '{f} 俘虏并登用了 {g}', evRelease: '{g} 被俘后不肯投降，被放走了',
  evNewLord: '{g} 继任为君主', evFall: '{f} 灭亡了！', evCapital: '{f} 把本城迁到 {c}', evCut: '{c} 断粮了！兵力减少', evHunger: '{f} 粮草不足，士兵逃散',
  evCoalition: '群雄结成反{f}联盟！', evCoalitionYou: '你占了万锦一半，其他君主联合起来对付你了！', evCoalitionEnd: '反{f}联盟解散了',
  sgHelpText: '一回合是一个月。每位武将每月做一件事：内政（开发，增加每月金粮）、征兵（花金加兵）、搜索（找藏在这座城的在野武将，开盲盒）、筑城（加城防）、计略（对邻城用流言让守兵逃散，或用火计烧城防，智力越高越容易成功）、调动（带兵去相邻的自己城或关）、出征（带兵打邻城）。没有武将的城下不了命令；武将多，一个月能做的事就多。\n\n武将：统率决定能带多少兵（统率 × 60，几位武将一起出征就加起来）；武力决定战斗力，打仗没有运气成分，兵力一样时武力高的一方一定赢（城防、地形、特技另算）。单挑靠读招（见下）。\n\n野战和截击：两支敌对的军队在同一条路上迎面相遇会打野战；敌军在经过你城的路上时，可以派武将“截击”，在城外把它打回去（不靠城墙，只比兵力 × 武力）。\n\n行军要花时间：路越长走得越久（1–3 个月），驿站路更快。行军中的军队会画在地图上，标着兵力和几个月后到；敌军来袭时左边面板会提醒你，赶紧征兵、筑城或调兵来守。不想一个个点，按“委任”让空闲武将自动干活（不会替你出征）。\n\n地形是真实的万锦：城和城之间的线是真实道路，也是粮道，只有和本城连成一片的城才有收入、能出征。胭脂河（Rouge River）两岸的城是沃野，粮多但地势低；渡河进攻 −15%，往高处打也吃亏（海拔来自真实地形数据）。\n\n每一局的地图都是新抽的：12 座城从 27 个真实地点（社区、商场广场、地标）里随机挑，按地理位置连上真实道路；路上的真实公园随机变成隘口，其中一个是“虎牢关”。隘口没有百姓，但城防极高；虎牢关开局有一位猛将守着，打下来有机会收降他。\n\n驿站和补给站：路上有真实加油站的是驿站路（地图上橙色“驿”字），沿这条路出征 +10%，调动还能一口气多走一段（中间那座城得是自己的）。有大商场、仓储店的城是补给站（绿色“补”字）。补给站本身就是粮源，连得上它的城都不断粮，粮也多 30%。\n\n季节：12–2 月下雪，进攻 −10%；9 月秋收，粮翻几倍；2 月春节庙会，每座城多收金。每月还可能有随机事件：商场夜市、丰收、义勇军、暴风雪、冰暴、胭脂河涨水、名士传闻……\n\n两边都有武将时可能单挑：对手每回合先亮架势，你读招应对（猛攻克必杀、必杀破防守、防守挡猛攻并反击）。你的智力不低于对手，架势一定是真的；对手智力更高，有时会佯攻骗你。武力决定伤害，武力相差 25 以上一击就能打倒对手；统率决定体力和斗志，必杀要花 50 斗志。同时拥有特定武将会激活羁绊，宿敌相见更容易单挑。谁占到 6 座城，其他君主就会结盟对付他。占满 12 座城（关不算）即统一万锦。',
}, {
  sgStart: '⚔ Heroes of Markham', sgTitle: 'Heroes of Markham', sgDateMix: 'Year {Y}, month {m}', sgEnd: 'End month', sgDate: 'Year {Y}, month {m}', sgGold: 'Gold', sgFood: 'Food', sgTroops: 'Troops', sgCities: 'Cities',
  sgLog: 'Log', sgMenu: 'Menu', sgMusicOn: '🎵 Music: on', sgMusicOff: '🎵 Music: off', sgBack: 'Back to the streets', sgNew: 'New game', sgModeQ: 'A new game: whose officers?', sgModeMix: 'All eras', sgModeMixS: '32 drawn from 118 great generals, from the Warring States to the Qing', sgModeSg: 'Three Kingdoms only', sgModeSgS: '32 drawn from the 48 of the Three Kingdoms', sgNewQ: 'A new game deals new blind boxes and your progress is lost. Sure?', sgHelp: 'How to play', sgHide: 'Tuck the panel away', sgContinue: 'Continue',
  sgYou: 'You', sgUnclaimed: 'Unclaimed', sgArmy: "{n}'s army",
  sgCmdDev: 'Build', sgCmdDevS: '+gold & food', sgCmdDraft: 'Draft', sgCmdDraftS: 'gold → troops', sgCmdSearch: 'Seek', sgCmdSearchS: 'find free officers', sgCmdMove: 'Move', sgCmdMoveS: 'to a city of yours',
  sgCmdMarch: 'Attack', sgCmdMarchS: 'a neighbour', sgCmdRest: 'Idle', sgCmdFort: 'Walls', sgCmdFortS: 'walls +', sgCmdPlot: 'Plot', sgRumor: 'Rumour', sgRumorS: 'troops desert', sgFire: 'Fire', sgFireS: 'burn the walls', sgChance: '{n}% chance', sgPickKind: 'Pick a plot, then a target', sgRumoured: 'Rumoured to be here: {g}', sgWinter: 'Winter snow: attacking −10%', sgHarvestNote: 'September harvest: food several times over', sgOrder: 'Order this month', sgPickTarget: 'Tap a glowing city on the map', sgCancel: 'Cancel',
  sgTroopsSend: 'Troops', sgGensSend: 'Officers going', sgNoGen: 'No officers here, so no orders. Move an officer in from next door.', sgCut: 'Cut off from your capital: no income, troops desert',
  sgCap: 'Capital', sgDev: 'Dev', sgDef: 'Walls', sgGarrison: 'Officers', sgNone: 'none', sgRumour: 'Rumoured free officers', sgRumourN: '{n}', sgRoad: 'Supply road',
  sgOwner: 'Owner', sgYourSide: 'Your forces', sgPickCity: 'Tap a city to see it and give orders. Only cities linked to your capital are supplied and can attack.',
  sgBonds: 'Bonds', sgBondOn: 'active', sgAllGens: 'All officers',
  sgReport: 'This month', sgQuiet: 'A quiet month.', sgBlind: 'Blind box!', sgBlindStart: 'Starting blind boxes', sgJoined: '{g} joins you!', sgRecruited: '{g} was captured and joins you!',
  sgDuel: 'Duel!', sgDuelVs: '{a} vs {d}', sgAtk: 'Strike', sgDefM: 'Guard', sgSkill: 'Special', sgDuelRule: 'Strike beats Special · Special breaks Guard · Guard stops Strike (and counters)', sgLooksatk: 'Looks like a strike', sgLooksdef: 'Looks like a guard', sgLooksskill: 'Looks like a special',
  sgTrustOk: 'Read: your INT {a} is no lower than his {b}, so this stance is real', sgTrustWarn: 'His INT {b} beats your {a}: about a {n}% chance it is a feint',
  sgSpirit: 'Spirit', sgSkillCost: '{n} spirit', sgDuelAuto: 'Let the computer fight', sgKoGap: 'A huge gap in WAR: {g} can finish it in one blow!',
  sgRoundWon: 'Read it right!', sgRoundLost: 'Caught out…', sgRoundTie: 'An even exchange', sgFeint: '(a feint!)',
  sgDuelWin: '{g} wins the duel!', sgDuelDraw: 'A draw!', sgRound: 'Round {n}', sgMoves: 'You: {a} · Them: {d}', sgHit: '{g} takes {n}', sgRival: 'Rivals meet: {r}',
  sgWin: 'Markham united!', sgWinS: 'All of Markham is yours after {n} months.', sgLose: 'Your forces are gone…', sgLoseS: 'You lasted {n} months. Try again with new blind boxes!', sgAgain: 'Play again',
  sgRivals: 'Rivals', sgIntro: '{a}, {b} and {c} want Markham too. Everyone starts with one city; 8 cities are up for grabs. This game\'s map is a fresh draw of real places; a mighty officer holds {p}.', sgOrders: 'Orders: {n}/{m} officers', sgAuto: 'Auto', sgAutoT: 'Give idle officers a job (develop, draft, search, fortify; no attacks)', sgAutoDone: '{n} idle officers got a job', sgAutoNone: 'Nobody is idle',
  sgPass: 'Pass', sgPassNote: 'A pass is a real park (river valley, woods) across the road between two cities. No people: no developing, drafting or searching, but huge walls. Move troops in and it holds the road.', sgBigPass: "Markham's Tiger Pass: the strongest pass this game",
  sgTerrStation: 'Relay +{n}%', sgStation: '{n}', sgDepot: 'Supply depot ({n}): a food source of its own, so cities linked to it are never cut off; food +{f}%', sgGuard: 'Guarded by', sgElev: 'Height', sgValley: 'Rouge River farmland: food +40%', sgWalls: 'Wall bonus', sgTerrRiver: 'River crossing −{n}%', sgTerrUp: 'Uphill −{n}%', sgTerrDown: 'Downhill +{n}%',
  sgTargets: 'Targets (or tap the map)', sgOfficersBtn: 'Officers', sgGarrisonCard: 'Garrison', sgCmdIntercept: 'Intercept', sgFxField: 'Field victory!', sgFxFieldLost: 'Beaten in the field…', sgArmyChip: '{f} {n} → {to}', sgMaxLead: '≤{n}', sgPickArmy: 'Pick an enemy army on a road through this city', evField: '{w} beat {l} in the field near {c}: {lw} lost {a}, {ll} lost {b}', evIntercept: '{g} sallies out of {c} against {f}', sgOddsA: 'Easy', sgOddsB: 'Good', sgOddsC: 'Even', sgOddsD: 'Risky', sgFxTake: 'Taken!', sgFxLost: 'Lost!', sgFxHeld: 'Held!', sgFxRepelled: 'Beaten back…', sgMonths: '{n} mo', sgOnRoad: 'On the road', sgEta: 'in {n} mo', sgEtaNow: 'this month', sgIncoming: 'Enemies coming', sgArmyTo: '{g} · {n} troops → {to} · {eta}', sgMarching: 'on the road → {to} ({eta})', sgOfficers: 'Officer orders', sgMoveTroops: 'Troops', sgGoldLeft: '{n} gold left', sgIdleN: '{n} idle',
  evDev: '{c}: {g} developed +{n}', evDraft: '{c}: {g} drafted +{n}', evFort: '{c}: {g} fortified +{n}', evSkip: "{g}'s order could not be carried out (gold, troops or things changed)", evTakePass: '{f} broke through {c}!',
  evRumorOk: '{g} spread rumours in {to}: {n} defenders deserted', evRumorNo: "{g}'s rumours in {to} fooled nobody", evFireOk: '{g} set {to} on fire: walls −{n}', evFireNo: "{g}'s fire attack on {to} fizzled",
  ev_nightmarket: 'The {c} night market is packed: {f} +{n} gold', ev_bumper: 'Bumper crop in {c}: {f} +{n} food', ev_volunteers: '{n} volunteers join up in {c}', ev_merchant: 'A caravan passes: {f} +{n} gold',
  ev_blizzard: 'Blizzard in {c}: {n} troops slip away', ev_icestorm: 'Ice storm in {c}: walls −{n}', ev_flood: 'The Rouge floods {c}: dev −4, troops −{n}', ev_riot: 'Unrest in {c}: troops −{n}',
  ev_sighting: 'Rumour: {g} is hiding in {c}', ev_cny: 'Lunar New Year fair! Every lord earns {n} more gold per city', evHarvest: 'September harvest: the granaries are full!', evFound: '{c}: {by} found {g}!', evFoundAI: '{f} found {g} in {c}',
  evTreasure: '{c}: nobody found, but {n} gold', evNothing: '{c}: searched, found nothing', evMove: '{g}: {c} → {to} with {n} troops, {m} mo on the road', evArrive: '{g} reached {c} with {n} troops', evBlocked: '{g}: the road to {to} is cut at {c}, attacking {c} instead',
  evMarch: '{f} marches {n} from {c} on {to}, arriving in {m} mo', evDuel: 'Duel {a} vs {d}: {w}', evDuelDraw: 'draw', evDuelWon: '{g} wins',
  evTake: '{f} took {c}!', evRepel: '{c} held off {f}', evFlee: '{g} fled to {c}', evRecruit: '{f} captured and recruited {g}', evRelease: '{g} was captured, refused to serve and was let go',
  evNewLord: '{g} is the new lord', evFall: '{f} is no more!', evCapital: '{f} moved its capital to {c}', evCut: '{c} is cut off! Troops desert', evHunger: '{f} ran out of food; troops desert',
  evCoalition: 'The lords unite against {f}!', evCoalitionYou: 'You hold half of Markham: the other lords unite against you!', evCoalitionEnd: 'The alliance against {f} broke up',
  sgHelpText: 'One turn is one month. Every officer does one thing a month: Build (develop: more gold and food every month), Draft (gold for troops), Seek (search for officers hiding in that city: blind boxes), Walls (fortify), Plot (rumours make a neighbour\'s troops desert, fire burns its walls; cleverer officers succeed more), Move (take troops to a neighbouring city or pass of yours), Attack (take troops against a neighbour). A city with no officers gets no orders; more officers, more done.\n\nOfficers: 统率 (LED) is how many troops an officer can lead (LED x 60; officers marching together add up); 武力 (WAR) is how hard the army fights. There is no luck in a battle: with the same troops the higher WAR always wins (walls, terrain and traits on top). Duels are about reading your opponent (below).\n\nField battles and sallies: two hostile armies meeting head-on on a road fight in the open; an enemy army on a road through your city can be intercepted, so you beat it back before it reaches your walls (no walls: troops x WAR only).\n\nMarching takes time: the longer the road, the longer it takes (1–3 months); relay roads are quicker. Armies on the road are drawn on the map with their troops and when they arrive; the panel warns you when enemies are coming, so draft, fortify or bring troops in. Tap Auto to give idle officers a peaceful job (it never attacks for you).\n\nThe terrain is real Markham: the lines are real roads and your supply lines; only cities linked to your capital earn and can attack. Cities along the Rouge River are rich farmland but low ground; attacking across the river costs 15%, and attacking uphill costs too (heights from real elevation data).\n\nEvery game draws a new map: 12 cities picked at random from 27 real places (neighbourhoods, plazas, landmarks), linked by the real roads between them; real parks on those roads randomly become passes, one of them the Tiger Pass. Passes have no people but huge walls; a mighty officer guards the Tiger Pass at the start, and you may win him over if you take it.\n\nRelays and depots: roads with a real gas station are relay roads (orange “G” on the map): attacking along them +10%, and an officer can move one road further in the same month (the city in between must be yours). Cities with a big mall or warehouse store are supply depots (green “S”). A depot is a food source of its own, so cities linked to it are never cut off, and it grows 30% more food.\n\nSeasons: December to February it snows (attacking −10%); September is harvest (food several times over); February brings the Lunar New Year fair (more gold per city). Most months something happens: mall night markets, bumper crops, volunteers, blizzards, ice storms, Rouge River floods, rumoured officers…\n\nWhen both sides have officers a duel may happen: each round your opponent takes a stance first and you answer it (Strike beats Special, Special breaks Guard, Guard stops Strike and counters). If your INT is no lower than his, the stance is real; a cleverer opponent sometimes feints. WAR sets the damage, and a gap of 25 or more ends it in one blow; LEAD gives stamina and spirit, and a Special costs 50 spirit. Certain officers together switch on bonds; rivals duel more often. Whoever holds 6 cities gets the other lords allied against them. Hold all 12 cities (passes do not count) to unite Markham.',
});

// v1.2 (D-102..D-105): difficulty, marching together, a safety net
extend({
  sgDiffQ: '电脑君主有多强？', sgDiff_normal: '普通', sgDiff_hard: '困难', sgDiff_hell: '地狱',
  sgDiffS_normal: '和以前一样：开局 6 个月不打你', sgDiffS_hard: '更早动手、兵更多、发展更快，你占到 5 城就会被围攻', sgDiffS_hell: '开局兵力是你的 1.5 倍，3 个月后就来，占 4 城就被围攻',
  sgHelpV12: '文官和武将（v1.2）：能力低的一项现在更低，办事效果按能力的平方算。政治高的内政快、花钱少；统率高的征兵多、带兵多；智力高的搜索准；武力决定打仗。让合适的人做合适的事。\n\n出征和调动可以勾选同城的其他武将一起去，合成一军。难度在“重新开局”时选。', sgWith: '同行武将（可多选，一起出发、合成一军）', sgWithMove: '一起调动（可多选）', sgWithLeft: '{g} 兵不够，留下了', sgOops: '刚才出了点小问题，这个月的动画已跳过', sgDiffNow: '难度：{d}',
}, {
  sgDiffQ: 'How strong are the computer lords?', sgDiff_normal: 'Normal', sgDiff_hard: 'Hard', sgDiff_hell: 'Hell',
  sgDiffS_normal: 'As before: nobody attacks you for 6 months', sgDiffS_hard: 'They move sooner, with more troops and faster growth, and unite against you at 5 cities', sgDiffS_hell: '1.5x your starting troops, on you after 3 months, united against you at 4 cities',
  sgHelpV12: 'Ministers and warriors (v1.2): weak stats are now weaker, and what an officer achieves grows with the square of his stat. Politics builds faster and cheaper; leadership drafts and leads more; intellect searches better; war wins battles. Give each job to the right person.\n\nWhen attacking or moving you can tick other officers of the same city to go along as one army. Difficulty is chosen when you start a new game.', sgWith: 'Marching with (pick any; they leave together as one army)', sgWithMove: 'Moving with (pick any)', sgWithLeft: '{g} has too few troops and stays', sgOops: 'Something went wrong; the rest of this month was played without the show', sgDiffNow: 'Difficulty: {d}',
});
// v1.1 (D-97, D-98): treasures, envoys, poaching, the first-game guide
extend({
  sgPoach: '挖角', sgPoachS: '策反邻城敌将', sgEnvoy: '停战', sgEnvoyS: '派使者，停战 {n} 个月', sgPickGen: '选要挖的敌将（只能挖邻城的，君主挖不动）', sgPickLord: '选要停战的君主', sgNoTarget: '现在没有可选的对象',
  sgTruceWith: '🤝 停战中，还剩 {n} 个月：双方都不能进攻', sgItem: '宝物', sgItemGive: '转交给', sgLoyal: '忠诚', sgLoyalS: '越低越容易被挖走', sgItemBox: '宝物盲盒！', sgItemGot: '{g} 在 {c} 搜出了宝物！', sgItemTo: '{g} 佩带。可以在“将”页面里转交给别人',
  itLead: '统率', itWar: '武力', itInt: '智力', itPol: '政治', itHp: '单挑体力', itSp: '单挑斗志',
  evItem: '{c}：{g} 找到了宝物 {i}', evItemAI: '{f} 在 {c} 找到了宝物 {i}', evPoachOk: '{g} 说动了 {t}：{t} 离开{from}，投奔{f}！', evPoachNo: '{g} 去挖 {t}，被一口回绝', evPoachedYou: '{t} 被{f}挖走了！',
  evTruceOk: '{g} 出使成功：{f}与{to}停战 {n} 个月', evTruceNo: '{g} 出使{to}，对方不肯停战', evTruceEnd: '{f}与{to}的停战到期了',
  sgTutMenu: '新手引导', sgTutNext: '下一步', sgTutSkip: '跳过', sgTutDone: '开始吧',
  sgTut1: '这是你的本城，已经帮你选中了。左边是这座城里的武将，每位武将每个月能做一件事。', sgTut2: '先让一位武将去“搜索”：有机会找到藏在城里的武将（开盲盒），也可能搜出宝物。按钮上的百分比是成功率，智力越高越容易。',
  sgTut3: '再让另一位“征兵”或“内政”。嫌麻烦就点上面的“委任”，空闲的武将会自动安排好。', sgTut4: '兵够了就点“出征”，再点地图上发光的城。先打灰色的空城，别急着碰其他君主。', sgTut5: '“计略”里除了流言和火计，还能“挖角”邻城的敌将，或者派人“停战”。',
  sgTut6: '都安排好了，点右上角的“结束本月”。占满所有城池，你就统一了万锦！',
  sgHelpMore: '宝物：搜索没找到人时，有机会搜出宝物（每局藏 10 件）。宝物由一位武将佩带，直接加他的能力，可以在“将”页面里转交。武将被俘、被挖走时宝物跟着走。\n\n挖角和停战（在“计略”里）：挖角是花钱策反邻城的敌将，对方忠诚越低、你的武将智力越高越容易，君主挖不动；电脑也会来挖你的人。停战是派使者和一位君主讲和 6 个月，期间双方都不能进攻；你太强、或者对方已经结盟对付你时很难谈成。',
}, {
  sgPoach: 'Poach', sgPoachS: 'turn an officer next door', sgEnvoy: 'Truce', sgEnvoyS: 'an envoy: {n} months of peace', sgPickGen: 'Pick an enemy officer next door (lords cannot be turned)', sgPickLord: 'Pick a lord to make peace with', sgNoTarget: 'Nobody to pick right now',
  sgTruceWith: '🤝 Truce, {n} months left: neither side may attack', sgItem: 'Treasure', sgItemGive: 'Hand to', sgLoyal: 'Loyalty', sgLoyalS: 'the lower, the easier to poach', sgItemBox: 'Treasure box!', sgItemGot: '{g} dug up a treasure in {c}!', sgItemTo: '{g} carries it. Hand it on from the Officers page',
  itLead: 'LED', itWar: 'WAR', itInt: 'INT', itPol: 'POL', itHp: 'duel stamina', itSp: 'duel spirit',
  evItem: '{c}: {g} found the treasure {i}', evItemAI: '{f} found the treasure {i} in {c}', evPoachOk: '{g} talked {t} round: {t} leaves {from} for {f}!', evPoachNo: '{g} tried to poach {t} and was turned down flat', evPoachedYou: '{t} was poached by {f}!',
  evTruceOk: "{g}'s embassy worked: {f} and {to} are at peace for {n} months", evTruceNo: '{g} went to {to}, who would not make peace', evTruceEnd: 'The truce between {f} and {to} has run out',
  sgTutMenu: 'Beginner guide', sgTutNext: 'Next', sgTutSkip: 'Skip', sgTutDone: "Let's go",
  sgTut1: 'This is your capital, already selected. On the left are the officers in it; each officer does one thing a month.', sgTut2: 'Send one officer to Seek: he may find an officer hiding in the city (a blind box) or dig up a treasure. The percentage on the button is his chance; cleverer officers do better.',
  sgTut3: 'Have another Draft or Build. Or tap Auto at the top and idle officers get a job by themselves.', sgTut4: 'With enough troops tap Attack, then a glowing city on the map. Take the grey unclaimed cities first and leave the other lords alone for now.', sgTut5: 'Under Plot, besides rumours and fire, you can Poach an enemy officer next door or send an envoy for a Truce.',
  sgTut6: 'All set? Tap End month at the top right. Hold every city and Markham is yours!',
  sgHelpMore: 'Treasures: a search that finds nobody may dig up a treasure (10 are hidden each game). One officer carries it and it adds straight to his stats; hand it on from the Officers page. It goes with him if he is captured or poached.\n\nPoaching and truces (under Plot): poaching pays an enemy officer next door to change sides; lower loyalty and a cleverer agent help, and lords cannot be turned. The computer poaches too. An envoy buys 6 months of peace with one lord, with no attacks either way; it rarely works when you are much stronger or the lords have united against you.',
});

const SAVE = 'p905sg';
const $ = (id) => document.getElementById(id);
const zh = () => getLang() === 'zh';
const F = (k, p = {}) => t(k).replace(/\{(\w+)\}/g, (_, x) => (p[x] ?? ''));
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// a name that is not there must never take the screen down with it (v1.2)
const gName = (id) => (GENERALS[id] ? (zh() ? GENERALS[id].zh : GENERALS[id].en) : '?');
const cName = (id) => (CITIES[id] ? (zh() ? CITIES[id].zh : CITIES[id].en) : '?');
const KCOL = { shu: '#2f8f4e', wei: '#2f5fae', wu: '#c0392b', qun: '#6b4f8a', xq: '#8a6d3b', qh: '#a8552a', st: '#b8860b', sy: '#2e7d7a', mq: '#b03a5b' };
const kNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
const MOVES = { atk: 'sgAtk', def: 'sgDefM', skill: 'sgSkill' };
// what the opponent's stance looks like (v0.9.9): [zh lines, en lines] per move
const STANCES = {
  atk: [['{g} 举起兵器，大喝一声冲了过来', '{g} 催马疾进，兵器高高扬起', '{g} 怒目圆睁，抢先出手'], ['{g} raises his weapon and charges with a roar', '{g} spurs his horse on, weapon held high', '{g} glares and moves to strike first']],
  def: [['{g} 横兵护身，稳住马步', '{g} 勒住战马，严阵以待', '{g} 收招退半步，守得滴水不漏'], ['{g} holds his weapon across his body and steadies himself', '{g} reins in and waits, guard up', '{g} steps back half a pace, guard tight']],
  skill: [['{g} 气势暴涨，正在蓄力', '{g} 眼中精光一闪，杀招将至', '{g} 深吸一口气，兵器嗡嗡作响'], ['{g} swells with fury, gathering power', '{g}\'s eyes flash: a killing blow is coming', '{g} draws a deep breath, his weapon humming']],
};
// the weather of a month (flavour, v0.9.7): snow in winter, the rest picked from the season and the month
export function weatherOf(s) {
  const m = E.dateOf(s).month, r = (s.turn * 7 + (s.seed || 0)) % 3;
  const w = E.isWinter(s) ? 'snow' : m === 9 ? 'harvest' : m <= 5 ? ['sun', 'rain', 'cloud'][r] : m <= 8 ? ['sun', 'hot', 'sun'][r] : ['sun', 'wind', 'cloud'][r];
  return { snow: ['雪', '❄'], harvest: ['秋收', '🌾'], sun: ['晴', '☀'], rain: ['雨', '☂'], cloud: ['阴', '☁'], hot: ['炎热', '☀'], wind: ['秋风', '🍂'] }[w];
}
const WEATHER_EN = { 雪: 'snow', 秋收: 'harvest', 晴: 'fair', 雨: 'rain', 阴: 'cloudy', 炎热: 'hot', 秋风: 'windy' };
const dateText = (s) => { const d = E.dateOf(s), y = d.year - 195, [w, ic] = weatherOf(s); return F(s.roster === 'mix' ? 'sgDateMix' : 'sgDate', { y: y === 1 ? '元' : y, Y: d.year, m: d.month }) + ` · ${ic} ${zh() ? w : WEATHER_EN[w]}`; };
const CMD_KEY = { poach: 'sgPoach', envoy: 'sgEnvoy', dev: 'sgCmdDev', draft: 'sgCmdDraft', search: 'sgCmdSearch', fort: 'sgCmdFort', plot: 'sgCmdPlot', move: 'sgCmdMove', march: 'sgCmdMarch', intercept: 'sgCmdIntercept' };

// v0.9.5 (D-82): rarity from the two best stats (UR: a 100 or two great ones), letter grades per stat
export const tierOf = (id) => E.tierOf(id); // rarity lives in the engine now (it shapes each game's roster)
const grade = (v) => (v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 65 ? 'B' : v >= 45 ? 'C' : 'D');
function portrait(id, size = 46) {
  const g = GENERALS[id], tr = tierOf(id);
  return `<span class="sgP t${tr}" style="width:${size}px;height:${size}px;background:${KCOL[g.k]};font-size:${Math.round(size * 0.56)}px"><i class="sgPf"><img src="${portraitURL(id)}" alt="${esc(g.glyph)}"></i>${size >= 40 ? `<i class="sgTier">${tr}</i>` : ''}${itemPip(id)}</span>`;
}
function statBars(id) {
  const g = E.gen(id), row = (l, v, c) => `<div class="sgSt"><span>${l}</span><i><b style="width:${v}%;background:${c}"></b></i><em>${v}</em><u class="g${grade(v)}">${grade(v)}</u></div>`;
  return (zh() ? [['统', g.lead], ['武', g.war], ['智', g.int], ['政', g.pol]] : [['LED', g.lead], ['WAR', g.war], ['INT', g.int], ['POL', g.pol]])
    .map(([l, v], i) => row(l, v, ['#7fb2f0', '#f08a6e', '#b79cf0', '#7fd1a1'][i])).join('');
}
function traitTag(id) { const tr = TRAITS[GENERALS[id].trait]; return `<span class="sgTr">${esc(zh() ? tr[0] : tr[1])}</span><small>${esc(zh() ? tr[2] : tr[3])}</small>`; }
// a tall officer card (v0.9.7, after the App Store game's cards; drawn by code, no artwork): kingdom tag,
// rarity stars, a big ink-brush character, name and best stat. opts.troops draws a troop bar under it.
const STARS = { UR: 5, SSR: 4, SR: 3, R: 2 };
const bio = (id) => (BIOS[id] ? `<p class="sgBio">${esc(BIOS[id][zh() ? 0 : 1])}</p>` : '');
const iName = (i) => (zh() ? ITEMS[i].zh : ITEMS[i].en);
const FXK = { lead: 'itLead', war: 'itWar', int: 'itInt', pol: 'itPol', hp: 'itHp', sp: 'itSp' };
export const itemFxText = (i) => Object.entries(ITEMS[i].fx).map(([k, v]) => `${t(FXK[k])} +${v}`).join(' · ');
const itemPip = (id) => { const i = E.itemOf(id); return i ? `<i class="sgIt t${ITEMS[i].tier}" title="${esc(iName(i))}">${ITEMS[i].glyph}</i>` : ''; };
function itemCard(i) {
  const it = ITEMS[i];
  return `<div class="sgItem t${it.tier} k${it.kind}"><i class="sgCstar">${'★'.repeat(STARS[it.tier])}</i><b>${it.glyph}</b><span>${esc(iName(i))}</span><em>${esc(itemFxText(i))}</em></div>`;
}
function tallCard(id, opts = {}) {
  const g = E.gen(id), tr = tierOf(id), top = [['统', 'L', g.lead], ['武', 'W', g.war], ['智', 'I', g.int], ['政', 'P', g.pol]].sort((a, b) => b[2] - a[2])[0];
  const bar = opts.troops !== undefined ? `<i class="sgCbar"><b style="width:${Math.max(0, Math.min(100, opts.pct ?? 100))}%"></b></i><em class="sgCtroops">${kNum(opts.troops)}</em>` : '';
  return `<div class="sgCardT t${tr} k${g.k}${opts.big ? ' big' : ''}${opts.cls ? ' ' + opts.cls : ''}" ${opts.data || ''}>
    <i class="sgCtag${zh() ? '' : ' v'}">${g.tag[zh() ? 0 : 1]}</i><i class="sgCstar">${'★'.repeat(STARS[tr])}</i>
    <b class="sgCglyph"><img class="sgCimg" src="${portraitURL(id)}" alt="${esc(g.glyph)}"></b><i class="sgCtier">${tr}</i>
    <span class="sgCname">${esc(gName(id))}</span><span class="sgCstat">${zh() ? top[0] : top[1]}${top[2]}</span>${itemPip(id)}${bar}</div>`;
}
function genCard(id, opts = {}) {
  return `<div class="sgG${opts.on ? ' on' : ''}${opts.pick ? ' pick' : ''}" ${opts.data || ''}>${portrait(id)}<div class="sgGi"><b>${esc(gName(id))}</b>${statBars(id)}<div class="sgTrw">${traitTag(id)}</div></div></div>`;
}

export class Sanguo {
  constructor(onClose) {
    this.onClose = onClose; this.cv = $('sgMap'); this.ctx = this.cv.getContext('2d'); this.ptrs = new Map();
    this.sel = null; this.mode = null; this.busy = false; this.pulse = 0; this.fx = []; this.shake = 0; this.tween = null; this.skipFx = false;
    $('sgEnd').addEventListener('click', () => this.endMonth());
    $('sgAuto').addEventListener('click', () => this.autoAssign());
    $('sgPanelTab').addEventListener('click', () => this.togglePanel(false));
    // zoom buttons for those who find pinching fiddly: in, out, back to your capital
    $('sgZIn').addEventListener('click', () => this.zoomAt(1.5, this.ox, this.oy));
    $('sgZOut').addEventListener('click', () => this.zoomAt(1 / 1.5, this.ox, this.oy));
    $('sgZHome').addEventListener('click', () => { this.k = this.s0; this.focus(this.s.factions[E.PLAYER].cap); });
    $('sgMenuBtn').addEventListener('click', () => this.menu());
    $('sgLogBtn').addEventListener('click', () => this.showLog());
    $('sgGenBtn').addEventListener('click', () => this.openGenerals());
    $('sgPanel').addEventListener('click', (e) => this.panelClick(e));
    dragScroll($('sg'), '#sgPanel, .sgCard');
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => { if (this.busy) this.skipFx = true; if (e.isPrimary) this.ptrs.clear(); /* a lost pointerup (iOS) must not leave a ghost finger */ cv.setPointerCapture(e.pointerId); const [x, y] = toGamePoint(e.clientX, e.clientY); this.ptrs.set(e.pointerId, { x, y, sx: x, sy: y }); this.moved = this.ptrs.size > 1; });
    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) return;
      const [x, y] = toGamePoint(e.clientX, e.clientY);
      if (this.ptrs.size === 1) { this.cx -= (x - p.x) / this.k; this.cz -= (y - p.y) / this.k; this.clamp(); if (Math.hypot(x - p.sx, y - p.sy) > 8) this.moved = true; }
      else {
        // two fingers: zoom about them and move with them
        const [a, b] = [...this.ptrs.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y), m0x = (a.x + b.x) / 2, m0y = (a.y + b.y) / 2;
        p.x = x; p.y = y;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y), m1x = (a.x + b.x) / 2, m1y = (a.y + b.y) / 2;
        if (d0 > 10) this.zoomAt(d1 / d0, m1x, m1y);
        this.cx -= (m1x - m0x) / this.k; this.cz -= (m1y - m0y) / this.k;
      }
      p.x = x; p.y = y;
    });
    const up = (e) => { const p = this.ptrs.get(e.pointerId); this.ptrs.delete(e.pointerId); if (p && !this.moved && !this.ptrs.size) this.tap(p.x, p.y); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => this.ptrs.delete(e.pointerId));
    document.addEventListener('touchend', (e) => { if (!e.touches.length) this.ptrs.clear(); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toGamePoint(e.clientX, e.clientY); this.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y); }, { passive: false });
  }

  // ---------------------------------------------------------------- open / save
  // background music (v0.9.8): on by default, remembered per browser
  get music() { try { return localStorage.getItem('p905sgbgm') !== '0'; } catch (e) { return true; } }
  set music(v) { try { localStorage.setItem('p905sgbgm', v ? '1' : '0'); } catch (e) { /* ignore */ } }
  open(world, W, H) {
    this.w = world;
    sfx.setBgmMood('calm'); sfx.bgm(this.music);
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { s = null; }
    const fresh = !s || s.v !== E.SAVE_V || s.over; // v0.8 changed the rules: an old save starts over
    if (fresh) s = E.newGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0, { map: 'random', roster: this.nextRoster || 'mix', diff: this.nextDiff || this.lastDiff() }); // a new board every game (D-77), its own officers (D-87)
    E.loadMap(s);
    this.s = s; s.orders = s.orders || {};
    this.sel = null; this.mode = null;
    this.resize(W, H, true);
    if (this.small) this.focus(s.factions[E.PLAYER].cap);
    this.render(); this.loop();
    if (fresh) this.intro();
  }
  save() { try { localStorage.setItem(SAVE, JSON.stringify(this.s)); } catch (e) { /* private mode */ } }
  resize(W, H, fit) {
    this.W = W; this.H = H;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); this.dpr = dpr;
    const small = H < 520; // phones in landscape
    this.small = small; $('sg').classList.toggle('small', small);
    // the panel floats on the left (it can be tucked away); the map uses the rest, below the top bar
    this.panelW = this.panelHidden ? 0 : small ? Math.min(250, Math.max(210, W * 0.27)) : Math.min(300, Math.max(240, W * 0.3));
    $('sgPanel').classList.toggle('hide', !!this.panelHidden); $('sgPanelTab').classList.toggle('show', !!this.panelHidden);
    const top = $('sgTop').offsetHeight || 48, bottom = 6, aw = W - this.panelW, ah = H - top - bottom;
    this.ox = this.panelW + aw / 2; this.oy = top + ah / 2;
    const xs = NODE_IDS.map((c) => CITIES[c].x), zs = NODE_IDS.map((c) => CITIES[c].z);
    const fitW = (aw - 30) / (Math.max(...xs) - Math.min(...xs) + 380), fitH = (ah - 24) / (Math.max(...zs) - Math.min(...zs) + 200);
    // a phone is wide and short: rather than a postage stamp, zoom in so the map fills the width and pan up and down
    const fitS = small ? Math.min(fitW, fitH * 1.7) : Math.min(fitW, fitH);
    this.sMin = Math.min(fitW, fitH) * 0.7; this.sMax = fitS * 5; // room to see the whole board, and to get close
    if (fit || !this.s0) { this.k = fitS; this.s0 = fitS; this.cx = (Math.max(...xs) + Math.min(...xs)) / 2; this.cz = (Math.max(...zs) + Math.min(...zs)) / 2 + 20; }
    this.k = Math.min(this.sMax, Math.max(this.sMin, this.k));
    this.clamp();
  }
  // keep the cities on screen: the view centre stays inside the box around them
  // keep the board on screen: the view may not wander past the cities (plus a margin for their labels),
  // and when zoomed in it never shows the empty table beyond them
  clamp() {
    const xs = NODE_IDS.map((c) => CITIES[c].x), zs = NODE_IDS.map((c) => CITIES[c].z), [HW, HH] = this.w.half;
    const x0 = Math.max(-HW, Math.min(...xs) - 240), x1 = Math.min(HW, Math.max(...xs) + 240);
    const z0 = Math.max(-HH, Math.min(...zs) - 160), z1 = Math.min(HH, Math.max(...zs) + 120);
    const top = $('sgTop').offsetHeight || 48, vw = (this.W - this.panelW) / 2 / this.k, vh = (this.H - top) / 2 / this.k;
    const lim = (v, lo, hi, half) => (hi - lo < 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, v)));
    this.cx = lim(this.cx, x0, x1, vw); this.cz = lim(this.cz, z0, z1, vh);
  }
  focus(c) { if (!CITIES[c]) return; this.cx = CITIES[c].x; this.cz = CITIES[c].z; this.clamp(); }
  togglePanel(hide) { this.panelHidden = hide; this.resize(this.W, this.H, false); this.render(); }
  loop() {
    if (!$('sg').classList.contains('show')) return;
    this.pulse += 1 / 60;
    if (this.tween) { // a smooth camera move (battle playback)
      const tw = this.tween, p = Math.min(1, (performance.now() - tw.t0) / tw.dur), e = p * p * (3 - 2 * p);
      this.cx = tw.x0 + (tw.x1 - tw.x0) * e; this.cz = tw.z0 + (tw.z1 - tw.z0) * e; this.k = tw.k0 + (tw.k1 - tw.k0) * e;
      if (p >= 1) { this.tween = null; this.clamp(); }
    }
    this.shake *= 0.88;
    try { this.draw(); } catch (err) { if (!this.drawErr) { this.drawErr = true; console.error('sg draw:', err); } }
    requestAnimationFrame(() => this.loop()); // one bad frame must not stop the map (and every wait that counts on it)
  }
  zoomAt(f, x = this.ox, y = this.oy) {
    const s = Math.min(this.sMax, Math.max(this.sMin, this.k * f));
    const wx = this.cx + (x - this.ox) / this.k, wz = this.cz + (y - this.oy) / this.k;
    this.k = s; this.cx = wx - (x - this.ox) / s; this.cz = wz - (y - this.oy) / s; this.clamp();
  }
  toScreen(x, z) { return [this.ox + (x - this.cx) * this.k, this.oy + (z - this.cz) * this.k]; }

  // ---------------------------------------------------------------- names
  fName(f) {
    if (f < 0) return t('sgUnclaimed');
    const fa = this.s.factions[f];
    return fa.player ? t('sgYou') : F('sgArmy', { n: gName(fa.lord) });
  }
  fColor(f) { return f < 0 ? NEUTRAL_COLOR : this.s.factions[f].color; }

  // ---------------------------------------------------------------- map
  tap(x, y) {
    if (this.busy) return;
    let bestC = null, bd = 38 * 38;
    for (const c of NODE_IDS) { const [sx, sy] = this.toScreen(CITIES[c].x, CITIES[c].z); const d = (sx - x) ** 2 + (sy - y + 10) ** 2; if (d < bd) { bd = d; bestC = c; } }
    if (!bestC) return;
    if (this.mode && this.mode.targets.includes(bestC)) { this.setTarget(bestC); return; }
    if (this.mode && bestC !== this.mode.c) this.mode = null;
    this.sel = bestC;
    if (this.panelHidden) { this.togglePanel(false); return; }
    this.render();
  }
  // v1.3 (D-111): the month shows on the map. Snow falls and settles in winter, rain streaks in a wet month,
  // the paper warms to gold in autumn and greens a little in spring. All drawn live, cheap (a few hundred strokes).
  season(c, x0, y0, mw, mh) {
    const st = this.s, se = E.seasonOf(st), [wname] = weatherOf(st), t = performance.now() / 1000;
    if (se === 'autumn') { c.fillStyle = 'rgba(214,140,40,.12)'; c.fillRect(x0, y0, mw, mh); }
    else if (se === 'spring') { c.fillStyle = 'rgba(120,170,80,.07)'; c.fillRect(x0, y0, mw, mh); }
    const W = this.W, H = this.H;
    if (wname === '雪') {
      c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(x0, y0, mw, mh);
      c.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 140; i++) {
        const sp = 18 + (i % 7) * 4, x = ((i * 97.3 + Math.sin(t * 0.8 + i) * 18 + t * 6) % (W + 20)) - 10, y = ((i * 53.7 + t * sp) % (H + 20)) - 10;
        c.beginPath(); c.arc(x, y, 1.2 + (i % 3) * 0.7, 0, 7); c.fill();
      }
    } else if (wname === '雨') {
      c.fillStyle = 'rgba(60,80,100,.08)'; c.fillRect(x0, y0, mw, mh);
      c.strokeStyle = 'rgba(200,215,230,.55)'; c.lineWidth = 1.1; c.beginPath();
      for (let i = 0; i < 120; i++) { const x = ((i * 89.1 + t * 60) % (W + 40)) - 20, y = ((i * 61.3 + t * 420) % (H + 40)) - 20; c.moveTo(x, y); c.lineTo(x - 4, y + 13); }
      c.stroke();
    } else if (wname === '秋风' || wname === '秋收') {
      for (let i = 0; i < 28; i++) {
        const x = ((i * 131.7 + t * 40) % (W + 40)) - 20, y = ((i * 71.9 + t * 18 + Math.sin(t + i) * 20) % (H + 40)) - 20;
        c.save(); c.translate(x, y); c.rotate(t * 2 + i); c.fillStyle = i % 3 ? 'rgba(200,110,40,.8)' : 'rgba(170,60,30,.8)'; c.beginPath(); c.ellipse(0, 0, 4, 2, 0, 0, 7); c.fill(); c.restore();
      }
    }
  }
  draw() {
    const c = this.ctx, W = this.W, H = this.H, s = this.k, w = this.w, [HW, HH] = w.half, st = this.s;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.wood) this.wood = c.createPattern(woodTile(), 'repeat');
    c.fillStyle = this.wood || '#241b14'; c.fillRect(0, 0, W, H); // the table the map lies on (v1.3: walnut)
    if (this.shake > 0.3) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    const [x0, y0] = this.toScreen(-HW, -HH), mw = HW * 2 * s, mh = HH * 2 * s;
    c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 24; c.fillStyle = '#9fd067'; c.fillRect(x0, y0, mw, mh); c.restore();
    c.save(); c.beginPath(); c.rect(x0, y0, mw, mh); c.clip();
    // v1.3 (D-110): the board is an old ink map of Markham on rice paper (js/sg_paper.js), baked once
    if (!this.paper) this.paper = bakePaper(w.map);
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.paper, x0, y0, mw, mh);
    this.season(c, x0, y0, mw, mh);
    c.restore();
    // a mounted scroll: dark border, a gold line, corner pieces
    c.strokeStyle = '#5a3a1e'; c.lineWidth = 7; c.strokeRect(x0 - 3.5, y0 - 3.5, mw + 7, mh + 7);
    c.strokeStyle = '#c9a24e'; c.lineWidth = 1.5; c.strokeRect(x0 - 8.5, y0 - 8.5, mw + 17, mh + 17);
    c.fillStyle = '#c9a24e';
    for (const [cx, cy] of [[x0, y0], [x0 + mw, y0], [x0, y0 + mh], [x0 + mw, y0 + mh]]) { c.save(); c.translate(cx, cy); c.rotate(Math.PI / 4); c.fillRect(-7, -7, 14, 14); c.fillStyle = '#5a3a1e'; c.fillRect(-3.5, -3.5, 7, 7); c.restore(); c.fillStyle = '#c9a24e'; }
    const sup = E.supplied(st, E.PLAYER);
    // supply roads
    for (const [a, b, road, river, station] of LINKS) {
      const [ax, ay] = this.toScreen(CITIES[a].x, CITIES[a].z), [bx, by] = this.toScreen(CITIES[b].x, CITIES[b].z);
      const oa = st.cities[a].owner, ob = st.cities[b].owner;
      // v1.3: a packed-earth road with ink edges; a road between two cities of one lord carries his colour
      const own = oa === ob && oa >= 0;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(70,48,28,.7)'; c.lineWidth = 11; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = '#d8bf8e'; c.lineWidth = 7.5; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.setLineDash(own ? [] : [3, 7]);
      c.strokeStyle = own ? this.fColor(oa) : 'rgba(110,80,50,.7)'; c.lineWidth = own ? 3.6 : 2; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.setLineDash([]);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const br = this.k < this.s0 * 1.3 ? 7 : 9; // little terrain marks, bigger when zoomed in
      if (river) badge(c, mx, my, '#2e6ed6', zh() ? '渡' : '≈', '#fff', br);
      if (station) { // 驿站: a real gas station, nudged off the river badge in the middle
        const t0 = station[1], tt = river && Math.abs(t0 - 0.5) < 0.18 ? (t0 >= 0.5 ? t0 + 0.2 : t0 - 0.2) : t0;
        badge(c, ax + (bx - ax) * tt, ay + (by - ay) * tt, '#e8892b', zh() ? '驿' : 'G', '#fff', br);
      }
      if (this.k > this.s0 * 1.5) {
        c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const tw = c.measureText(road).width + 10, ly = my + (river ? 18 : 0);
        c.fillStyle = 'rgba(255,255,255,.88)'; rr(c, mx - tw / 2, ly - 8, tw, 16, 8); c.fill();
        c.fillStyle = '#5a4632'; c.fillText(road, mx, ly + 0.5);
      }
    }
    // planned orders: arrows (one per road and kind)
    const seen = new Set();
    for (const [id, o] of Object.entries(st.orders || {})) if ((o.cmd === 'march' || o.cmd === 'move') && st.gens[id] && st.gens[id].c) {
      const from = st.gens[id].c, key = from + o.to + o.cmd;
      if (seen.has(key)) continue;
      seen.add(key);
      // along the actual roads (v0.9.8: an order can go several roads far); the arrow head on the last one
      const r = E.routeOf(st, E.PLAYER, from, o.to), colr = o.cmd === 'march' ? '#e23d3d' : '#2f7de1';
      for (let i = 1; i < r.length; i++) {
        const [ax, ay] = this.toScreen(CITIES[r[i - 1]].x, CITIES[r[i - 1]].z), [bx, by] = this.toScreen(CITIES[r[i]].x, CITIES[r[i]].z);
        if (i === r.length - 1) arrow(c, ax, ay, bx, by, colr, this.pulse);
        else { c.strokeStyle = colr; c.lineWidth = 4; c.setLineDash([]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
      }
    }
    // targets while picking
    if (this.mode) for (const tc of this.mode.targets) {
      const [x, y] = this.toScreen(CITIES[tc].x, CITIES[tc].z), r = 30 + 4 * Math.sin(this.pulse * 5);
      c.strokeStyle = '#f2c14e'; c.lineWidth = 4; c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, 7); c.stroke();
    }
    // cities and passes first, labels on top (so a name is never hidden behind a neighbour's castle)
    const ts = Math.min(1, Math.max(0.55, this.k / 0.22)), fs = Math.round(Math.max(10.5, 12 * ts));
    for (const id of NODE_IDS) {
      const C = st.cities[id], [x, y] = this.toScreen(CITIES[id].x, CITIES[id].z), col = this.fColor(C.owner);
      if (id === this.sel) { c.strokeStyle = '#f2c14e'; c.lineWidth = 3.5; c.beginPath(); c.ellipse(x, y + 3, 38 * ts, 15 * ts, 0, 0, 7); c.stroke(); }
      if (CITIES[id].pass) gate(c, x, y, col, CITIES[id].big, ts);
      else {
        const threat = (st.armies || []).some((A) => A.to === id && A.kind === 'march' && A.f !== C.owner && !(C.owner >= 0 && E.isAlly(st, A.f, C.owner)));
        drawCity(c, x, y, cityKind(id), col, C.owner >= 0 && st.factions[C.owner].cap === id, C.owner === E.PLAYER ? '君' : C.owner > 0 ? GENERALS[st.factions[C.owner].lord].glyph : '', ts, C.dev, { troops: C.troops, threat, t: this.pulse });
      }
    }
    // labels: the most important first (selected, yours, cities, then passes), each in the first free spot
    // around its castle (below, above, right, left); when nothing is free a city shows just its troops
    const ordered = new Set(Object.keys(st.orders || {}));
    const pos = Object.fromEntries(NODE_IDS.map((id) => [id, this.toScreen(CITIES[id].x, CITIES[id].z)]));
    const taken = NODE_IDS.map((id) => ({ id, r: [pos[id][0] - 20 * ts, pos[id][1] - 30 * ts, pos[id][0] + 20 * ts, pos[id][1] + 10 * ts] }));
    const top = $('sgTop').offsetHeight || 48, inside = (r) => r[1] >= Math.max(y0, top) && r[3] <= Math.min(y0 + mh, H) && r[0] >= x0 && r[2] <= x0 + mw;
    const free = (r, id) => inside(r) && !taken.some((q) => q.id !== id && r[0] < q.r[2] && r[2] > q.r[0] && r[1] < q.r[3] && r[3] > q.r[1]);
    // the panel, the buttons and the compass sit on top of the map: labels keep clear of them too
    const box = (el) => (el && el.offsetWidth ? [el.offsetLeft - 4, el.offsetTop - 4, el.offsetLeft + el.offsetWidth + 4, el.offsetTop + el.offsetHeight + 4] : null);
    for (const r of [this.panelHidden ? box($('sgPanelTab')) : [0, 0, this.panelW + 12, H], box($('sgAuto')), box($('sgEnd')), box($('sgZoom')), [this.panelW, H - 60, this.panelW + 110, H]]) if (r) taken.push({ id: '', r });
    const prio = (id) => (id === this.sel ? 0 : st.cities[id].owner === E.PLAYER ? 1 : CITIES[id].pass ? 3 : 2);
    c.font = `700 ${fs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lh = fs + 7, tag = 16;
    for (const id of [...NODE_IDS].sort((a, b) => prio(a) - prio(b))) {
      const C = st.cities[id], col = this.fColor(C.owner), [x, y] = pos[id], P = CITIES[id];
      const zoomedOut = this.k < this.s0 * 1.4, dep = !!P.depot;
      // a clean board (v0.9.7): zoomed out, other lords' cities show their name only; tap one (or zoom in) for numbers
      const showN = !zoomedOut || C.owner === E.PLAYER || id === this.sel || (this.mode && this.mode.targets.includes(id));
      const texts = P.pass && zoomedOut ? [showN ? kNum(C.troops) : ''] : showN ? [`${cName(id)} · ${kNum(C.troops)}`, kNum(C.troops)] : [cName(id)];
      if (!texts[0]) continue;
      const spots = (w) => {
        const below = [x, y + 18 * ts + 9], above = [x, y - 44 * ts], right = [x + 26 * ts + w / 2, y - 6 * ts], left = [x - 26 * ts - w / 2, y - 6 * ts];
        return P.pass ? [right, left, above, below] : [below, above, right, left];
      };
      let pick = null;
      for (const tx of texts) {
        const w = c.measureText(tx).width + 20 + (dep ? tag : 0);
        for (const [lx, ly] of spots(w)) { const r = [lx - w / 2, ly - lh / 2, lx + w / 2, ly + lh / 2]; if (free(r, id)) { pick = { tx, w, lx, ly, r }; break; } }
        if (pick) break;
      }
      if (!pick) {
        if (P.pass && prio(id) > 1) continue; // a crowded pass: tap it to see it
        const tx = texts[texts.length - 1], w = c.measureText(tx).width + 20 + (dep ? tag : 0), [lx, ly] = spots(w)[0];
        pick = { tx, w, lx, ly, r: [lx - w / 2, ly - lh / 2, lx + w / 2, ly + lh / 2] };
      }
      taken.push({ id: '', r: pick.r });
      const { tx, w, lx, ly } = pick;
      c.fillStyle = id === this.sel ? 'rgba(90,60,20,.95)' : P.pass ? 'rgba(70,52,38,.92)' : 'rgba(38,29,22,.88)'; rr(c, lx - w / 2, ly - lh / 2, w, lh, lh / 2); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(lx - w / 2 + 9, ly, 3.5, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.fillText(tx, lx + 5 - (dep ? tag / 2 : 0), ly + 0.5);
      if (dep) { // 补给站: a big mall next door
        const bx = lx + w / 2 - tag - 2;
        c.fillStyle = '#2f8f4e'; rr(c, bx, ly - lh / 2 + 3, tag, lh - 6, 4); c.fill();
        c.fillStyle = '#fff'; c.font = `900 ${Math.round(fs * 0.8)}px system-ui, sans-serif`; c.fillText(zh() ? '补' : 'S', bx + tag / 2, ly + 0.5);
        c.font = `700 ${fs}px system-ui, sans-serif`;
      }
    }
    for (const id of NODE_IDS) {
      const C = st.cities[id], [x, y] = pos[id];
      if (C.owner === E.PLAYER && !sup.has(id)) badge(c, x - 26 * ts, y - 30 * ts, '#d64545', zh() ? '断' : '!');
      if (C.owner === E.PLAYER) { // officers with orders / officers here
        const gs = E.gensIn(st, id, E.PLAYER);
        if (gs.length) { const n = gs.filter((g) => ordered.has(g)).length; pill(c, x + 28 * ts, y - 28 * ts, n === gs.length ? '#f2c14e' : '#fff', `${n}/${gs.length}`); }
      }
      if (C.owner > 0 && st.factions[C.owner].cap === id && E.truceLeft(st, E.PLAYER, C.owner)) badge(c, x - 28 * ts, y - 26 * ts, '#2f8f4e', zh() ? '和' : '☮');
      if (C.owner === -1 && E.guardsIn(st, id).length) badge(c, x - 28 * ts, y - 24 * ts, '#6b4f8a', GENERALS[E.guardsIn(st, id)[0]].glyph);
    }
    // armies on the road (v0.9.3): a banner part of the way along the road, with troops and arrival
    for (const a of st.armies || []) {
      const pts = a.route.map((n) => this.toScreen(CITIES[n].x, CITIES[n].z));
      const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), len = seg.reduce((x, y) => x + y, 0);
      let d = len * Math.min(0.85, Math.max(0.15, (a.total - a.left) / a.total)), i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const u = seg[i] ? d / seg[i] : 0, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u, [tx, ty] = pts[pts.length - 1];
      const col = this.fColor(a.f), lead = a.gens[0];
      c.strokeStyle = col; c.lineWidth = 3; c.setLineDash([6, 5]); c.lineDashOffset = -this.pulse * 30;
      c.beginPath(); c.moveTo(x, y); for (let j = i + 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
      const ang = Math.atan2(ty - y, tx - x), bob = Math.sin(this.pulse * 6 + a.id) * 1.5;
      c.save(); c.translate(x, y + bob);
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 12, 12, 4, 0, 0, 7); c.fill();
      c.strokeStyle = '#5a4632'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 10); c.lineTo(0, -22); c.stroke();
      c.fillStyle = col; c.beginPath(); c.moveTo(0, -22); c.lineTo(Math.cos(ang) >= 0 ? 20 : -20, -17); c.lineTo(0, -10); c.closePath(); c.fill();
      c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 2, 10, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = "900 11px 'STKaiti','KaiTi','Kaiti SC',serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(lead ? GENERALS[lead].glyph : '兵', 0, 2.5);
      c.restore();
      pill(c, x, y + 24, a.f === E.PLAYER ? '#cfe3ff' : '#ffd6d0', `${kNum(a.troops)} · ${this.eta(a)}`);
    }
    // battle effects (v0.9.4): clashing swords, a burst when a city falls, a rising banner
    const now = performance.now();
    this.fx = this.fx.filter((f) => now - f.t0 < f.dur);
    for (const f of this.fx) {
      const p = (now - f.t0) / f.dur, [x, y] = f.at ? this.toScreen(f.at.x, f.at.z) : this.toScreen(CITIES[f.c].x, CITIES[f.c].z);
      c.save();
      if (f.type === 'clash') {
        const r = 26 + 22 * Math.sin(p * Math.PI);
        for (let i = 0; i < 10; i++) { // sparks
          const a = i / 10 * 6.283 + p * 2, r0 = r * 0.6, r1 = r * (1 + 0.5 * ((i * 7) % 3) / 3);
          c.strokeStyle = i % 2 ? f.ca : f.cb; c.lineWidth = 3; c.globalAlpha = 1 - p * 0.6;
          c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y - 10 + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y - 10 + Math.sin(a) * r1); c.stroke();
        }
        c.globalAlpha = 1; c.font = `900 ${Math.round(34 + 10 * Math.sin(p * 20))}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('⚔', x, y - 12);
        if (f.text) { c.font = '900 13px system-ui, sans-serif'; pill(c, x, y + 34, '#fff', f.text); }
      } else if (f.type === 'burst') {
        c.strokeStyle = f.ca; c.lineWidth = 6 * (1 - p); c.globalAlpha = 1 - p;
        c.beginPath(); c.arc(x, y - 6, 20 + 80 * p, 0, 7); c.stroke();
      } else if (f.type === 'banner') {
        const sc = p < 0.15 ? 0.6 + p / 0.15 * 0.5 : 1.1 - Math.min(0.1, (p - 0.15));
        c.globalAlpha = p > 0.8 ? (1 - p) / 0.2 : 1; c.translate(x, y - 60 - 20 * p); c.scale(sc, sc);
        c.font = "900 26px 'STKaiti','KaiTi','Kaiti SC',serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 6; c.strokeStyle = '#2b211a'; c.strokeText(f.text, 0, 0); c.fillStyle = f.ca; c.fillText(f.text, 0, 0);
      } else if (f.type === 'puff') {
        c.strokeStyle = f.ca; c.lineWidth = 3; c.globalAlpha = 0.8 * (1 - p);
        c.beginPath(); c.arc(x, y - 6, 12 + 30 * p, 0, 7); c.stroke();
      }
      c.restore();
    }
    // compass, bottom left of the map area (the corners on the right hold the buttons)
    const nx = this.panelW + (this.panelHidden ? 70 : 32), ny = H - 30;
    c.fillStyle = 'rgba(38,29,22,.85)'; c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.5; c.beginPath(); c.arc(nx, ny, 15, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#f2c14e'; c.beginPath(); c.moveTo(nx, ny - 11); c.lineTo(nx + 5, ny + 2); c.lineTo(nx - 5, ny + 2); c.closePath(); c.fill();
    c.fillStyle = '#f5ebdd'; c.font = '900 9px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny + 8);
  }

  // ---------------------------------------------------------------- side panel
  goldLeft() { const st = this.s; return st.factions[E.PLAYER].gold - Object.entries(st.orders).reduce((a, [id, o]) => a + E.orderCost(o, id), 0); }
  render() {
    const st = this.s, me = st.factions[E.PLAYER];
    $('sgDate').textContent = dateText(st);
    const troops = E.ownedBy(st, E.PLAYER).reduce((a, c) => a + st.cities[c].troops, 0);
    $('sgRes').innerHTML = [['金', 'sgGold', me.gold, '#f2c14e'], ['粮', 'sgFood', me.food, '#e9d8a6'], ['兵', 'sgTroops', troops, '#f08a6e'], ['城', 'sgCities', E.citiesOf(st, E.PLAYER).length + '/12', '#7fb2f0']]
      .map(([ch, k, v, col]) => `<span title="${esc(t(k))}"><i style="background:${col}">${zh() ? ch : t(k)[0]}</i>${typeof v === 'number' ? kNum(v) : v}</span>`).join('');
    $('sgEnd').textContent = t('sgEnd');
    const idle = E.factionGens(st, E.PLAYER).filter((g) => st.gens[g].c && !st.orders[g]).length;
    $('sgAuto').innerHTML = `${t('sgAuto')}${idle ? `<i>${idle}</i>` : ''}`; $('sgAuto').title = t('sgAutoT');
    // a phone's top bar is tight: round one-character buttons there (like the App Store game's 城 / 将 / 军 dock)
    $('sgLogBtn').textContent = this.small && zh() ? '报' : t('sgLog'); $('sgMenuBtn').textContent = this.small ? '≡' : t('sgMenu'); $('sgTitle').textContent = t('sgTitle');
    $('sgGenBtn').textContent = zh() ? '将' : t('sgOfficersBtn');
    for (const id of ['sgGenBtn', 'sgLogBtn']) $(id).classList.toggle('pill', this.small && !zh()); // English words do not fit a round button
    $('sgPanel').innerHTML = this.sel ? this.cityPanel(this.sel) : this.sidePanel();
    if (this.mode) { const pk = [...document.querySelectorAll('#sgPanel .sgChips')].pop(); if (pk && pk.scrollIntoView) pk.scrollIntoView({ block: 'nearest' }); } // the choices for the order being given stay in view on a phone
    this.save();
  }
  sidePanel() {
    const st = this.s, gs = E.byLead(E.factionGens(st, E.PLAYER)), bonds = E.activeBonds(st, E.PLAYER, []);
    const n = gs.filter((g) => st.orders[g]).length;
    const season = E.isWinter(st) ? `<p class="sgHint">❄ ${t('sgWinter')}</p>` : E.dateOf(st).month === 9 ? `<p class="sgHint">🌾 ${t('sgHarvestNote')}</p>` : '';
    const mineA = (st.armies || []).filter((a) => a.f === E.PLAYER), foeA = (st.armies || []).filter((a) => a.f !== E.PLAYER && st.cities[a.to].owner === E.PLAYER);
    const armyRow = (a) => `<div class="sgArmy"><span class="sgDot" style="background:${this.fColor(a.f)}"></span>${esc(F('sgArmyTo', { g: a.gens.map(gName).join('、') || this.fName(a.f), n: kNum(a.troops), to: cName(a.to), eta: this.eta(a) }))}</div>`;
    const armies = (foeA.length ? `<h4 class="sgRed">⚠ ${t('sgIncoming')}</h4>${foeA.map(armyRow).join('')}` : '') + (mineA.length ? `<h4>🚩 ${t('sgOnRoad')}</h4>${mineA.map(armyRow).join('')}` : '');
    return `<h3>${t('sgYourSide')}<button class="sgX" data-a="hide" title="${t('sgHide')}">«</button></h3>${season}${armies}<p class="sgHint">${t('sgPickCity')}</p><p class="sgHint">${F('sgOrders', { n, m: gs.length })} · ${F('sgGoldLeft', { n: this.goldLeft() })}</p>
      ${bonds.length ? `<h4>${t('sgBonds')}</h4>${bonds.map((b) => `<div class="sgBond">${esc(zh() ? b.zh : b.en)} · ${t('sgBondOn')}</div>`).join('')}` : ''}
      <h4>${t('sgAllGens')} · ${gs.length}</h4>${gs.map((g) => genCard(g) + `<div class="sgWhere">${st.gens[g].c ? '📍 ' + esc(cName(st.gens[g].c)) : '🚩 ' + esc(this.armyOf(g) ? F('sgMarching', { to: cName(this.armyOf(g).to), eta: this.eta(this.armyOf(g)) }) : t('sgOnRoad'))}${st.orders[g] ? ' · ' + esc(this.orderText(st.orders[g])) : ''}</div>`).join('')}`;
  }
  terrTags(from, to) {
    const tr = E.terrain(from, to), d = CITIES[to].elev - CITIES[from].elev, k = CFG.sg, out = [];
    if (tr.why.includes('river')) out.push(F('sgTerrRiver', { n: Math.round(k.riverPen * 100) }));
    if (tr.why.includes('uphill')) out.push(F('sgTerrUp', { n: Math.round(Math.min(k.hillMax, d * k.hillPerM) * 100) }));
    if (tr.why.includes('station')) out.push(F('sgTerrStation', { n: Math.round(k.stationAtk * 100) }));
    if (tr.why.includes('downhill')) out.push(F('sgTerrDown', { n: Math.round(Math.min(k.hillMax / 2, -d * k.hillPerM / 2) * 100) }));
    return out;
  }
  cityPanel(c) {
    const st = this.s, C = st.cities[c], mine = C.owner === E.PLAYER, gs = C.owner >= 0 ? E.byLead(E.gensIn(st, c, C.owner)) : E.guardsIn(st, c), info = CITIES[c];
    const cap = C.owner >= 0 && st.factions[C.owner].cap === c;
    let h = `<h3><span class="sgDot" style="background:${this.fColor(C.owner)}"></span>${esc(cName(c))}<button class="sgX" data-a="hide" title="${t('sgHide')}">«</button><button class="sgX" data-a="close">✕</button></h3>
      <div class="sgSub">${esc(this.fName(C.owner))}${cap ? ' · ' + t('sgCap') : ''}${info.pass ? ' · ' + t('sgPass') : ''} · ${t('sgElev')} ${info.elev} m</div>
      <div class="sgGrid"><div><small>${t('sgTroops')}</small><b>${C.troops.toLocaleString()}</b></div><div><small>${t('sgDef')}</small><b>${C.def}</b></div>
      ${info.pass ? `<div><small>${t('sgWalls')}</small><b>×${E.wallMul(C).toFixed(2)}</b></div><div><small>${t('sgGarrison')}</small><b>${gs.length}</b></div>`
        : `<div><small>${t('sgDev')}</small><b>${C.dev}</b></div><div><small>${t('sgRumour')}</small><b>${F('sgRumourN', { n: E.hiddenIn(st, c).length })}</b></div>`}</div>`;
    if (C.owner > 0 && E.truceLeft(st, E.PLAYER, C.owner)) h += `<p class="sgHint sgTruce">${esc(F('sgTruceWith', { n: E.truceLeft(st, E.PLAYER, C.owner) }))}</p>`;
    if (info.big) h += `<p class="sgHint">🏯 ${t('sgBigPass')}</p>`;
    if (info.pass) h += `<p class="sgHint">${t('sgPassNote')}</p>`;
    if (info.valley) h += `<p class="sgHint">🌾 ${t('sgValley')}</p>`;
    if (info.depot) h += `<p class="sgHint">🛒 ${esc(F('sgDepot', { n: zh() ? info.depot[0] : info.depot[1], f: Math.round(CFG.sg.depotFood * 100) }))}</p>`;
    const rum = E.hiddenIn(st, c).filter((g) => st.gens[g].rumor);
    if (rum.length) h += `<p class="sgHint">🗣 ${esc(F('sgRumoured', { g: rum.map(gName).join('、') }))}</p>`;
    if (mine && !E.supplied(st, E.PLAYER).has(c)) h += `<p class="sgWarn">${t('sgCut')}</p>`;
    for (const a of (st.armies || []).filter((x) => x.to === c && x.f !== C.owner)) h += `<p class="sgWarn">⚠ ${esc(F('sgArmyTo', { g: a.gens.map(gName).join('、') || this.fName(a.f), n: kNum(a.troops), to: cName(c), eta: this.eta(a) }))}</p>`;
    if (mine) h += this.orderBlock(c, gs);
    else h += `<h4>${C.owner === -1 && gs.length ? t('sgGuard') : t('sgGarrison')}</h4>${gs.length ? gs.map((g) => genCard(g)).join('') : `<p class="sgHint">${t('sgNone')}</p>`}`;
    h += `<h4>${t('sgRoad')}</h4>${ADJ[c].map(({ c: n, road }) => `<div class="sgRoadRow"><span class="sgDot" style="background:${this.fColor(st.cities[n].owner)}"></span>${esc(cName(n))}<small>${esc(road)}${ADJ[c].find((x) => x.c === n).station ? ' · ⛽ ' + esc(F('sgStation', { n: ADJ[c].find((x) => x.c === n).station })) : ''}${this.terrTags(n, c).length ? ' · ' + esc(this.terrTags(n, c).join(' ')) : ''}</small></div>`).join('')}`;
    return h;
  }
  // a rough chance for an attack by officer id (with the default 80% of the free troops) on node n
  odds(c, n, id, army = null) {
    const st = this.s, troops = Math.min(E.commandOf(id), Math.floor(this.avail(c, id) * 0.8));
    let r;
    if (army) r = E.armyPower(troops, [id]) / Math.max(1, E.armyPower(army.troops, army.gens));
    else { const T = st.cities[n]; r = E.armyPower(troops, [id]) * E.terrain(this.lastHop(c, n), n).m / Math.max(1, E.armyPower(T.troops, E.defenders(st, n)) * E.wallMul(T)); }
    const [k, cls] = r >= 1.6 ? ['sgOddsA', 'a'] : r >= 1.15 ? ['sgOddsB', 'b'] : r >= 0.85 ? ['sgOddsC', 'c'] : ['sgOddsD', 'd'];
    return ` <b class="sgOdds o${cls}">${t(k)}</b>`;
  }
  lastHop(c, n) { const r = E.routeOf(this.s, E.PLAYER, c, n); return r[r.length - 2]; } // the road an army ends on
  armyOf(g) { return (this.s.armies || []).find((a) => a.gens.includes(g)) || null; }
  eta(a) { return a.left <= 1 ? t('sgEtaNow') : F('sgEta', { n: a.left }); }
  orderText(o) {
    const k = o.cmd === 'plot' ? (o.kind === 'fire' ? 'sgFire' : 'sgRumor') : CMD_KEY[o.cmd];
    if (o.cmd === 'poach') return `${t(k)} → ${gName(o.g)}`;
    if (o.cmd === 'envoy') return `${t(k)} → ${this.fName(o.f)}`;
    if (o.cmd === 'intercept') { const A = (this.s.armies || []).find((a) => a.id === o.army); return t(k) + (A ? ` → ${this.fName(A.f)}` : '') + (o.n ? ' · ' + kNum(o.n) : ''); }
    return t(k) + (o.to ? ` → ${cName(o.to)}${o.n ? ' · ' + kNum(o.n) : ''}` : '');
  }
  // troops in city c not yet promised to an officer's move / march (other than `id`)
  avail(c, id) { const st = this.s; return Math.max(0, st.cities[c].troops - Object.entries(st.orders).filter(([g, o]) => g !== id && st.gens[g]?.c === c && (o.cmd === 'march' || o.cmd === 'move' || o.cmd === 'intercept')).reduce((a, [, o]) => a + (o.n || 0), 0)); }
  orderBlock(c, gs) {
    const st = this.s, gold = this.goldLeft();
    if (!gs.length) return `<h4>${t('sgOfficers')}</h4><p class="sgHint">${t('sgNoGen')}</p>`;
    let h = `<h4>${t('sgOfficers')} <small class="sgGold">${F('sgGoldLeft', { n: gold })}</small></h4>`;
    for (const id of gs) {
      const o = st.orders[id], m = this.mode && this.mode.id === id ? this.mode : null, cur = o ? o.cmd : null;
      const can = (cmd) => {
        if (cur === cmd) return true;
        if (cmd === 'march') return E.marchTargets(st, E.PLAYER, c).some((n) => E.validOrder(st, E.PLAYER, id, { cmd, to: n }));
        if (cmd === 'move') return E.moveTargets(st, E.PLAYER, c).length > 0;
        if (cmd === 'intercept') return st.cities[c].troops >= CFG.sg.minMarch;
        if (cmd === 'plot') return gold + E.orderCost(o, id) >= E.orderCost({ cmd }, id) && (ADJ[c].some(({ c: n }) => E.validOrder(st, E.PLAYER, id, { cmd, kind: 'rumor', to: n })) || this.plotKinds(c, id).length > 0);
        return E.validOrder(st, E.PLAYER, id, { cmd }) && gold + E.orderCost(o, id) >= E.orderCost({ cmd }, id);
      };
      // what this officer would get done: his stats, made visible on the buttons (D-82)
      const C = st.cities[c], cost = (cmd) => (E.costOf(cmd, id) ? `${E.costOf(cmd, id)}${zh() ? '金' : 'g'}` : '');
      const prev = {
        dev: `+${Math.min(100 - C.dev, E.devAmt(st, E.PLAYER, id))} · ${cost('dev')}`,
        draft: `+${kNum(Math.max(0, Math.min(E.capOf(C) - C.troops, E.draftAmt(id))))} · ${cost('draft')}`,
        search: `${Math.round(E.searchChance(st, E.PLAYER, id) * 100)}%`,
        fort: `+${E.fortAmt(id)} · ${cost('fort')}`,
        plot: cost('plot'), move: F('sgMaxLead', { n: kNum(E.commandOf(id)) }), march: F('sgMaxLead', { n: kNum(E.commandOf(id)) }), intercept: '',
      };
      const cmds = [...(CITIES[c].pass ? ['fort', 'plot', 'move', 'march'] : ['dev', 'draft', 'search', 'fort', 'plot', 'move', 'march']), ...(E.interceptTargets(st, E.PLAYER, c).length ? ['intercept'] : [])];
      const g = E.gen(id);
      h += `<div class="sgO${o ? ' set' : ''}"><div class="sgOh">${portrait(id, 34)}<div><b>${esc(gName(id))}</b><small>${zh() ? '统' : 'L'}${g.lead} ${zh() ? '武' : 'W'}${g.war} ${zh() ? '智' : 'I'}${g.int} ${zh() ? '政' : 'P'}${g.pol}</small></div>
        <em>${o ? esc(this.orderText(o)) : t('sgCmdRest')}</em></div>
        <div class="sgCmds">${cmds.map((cmd) => `<button class="sgCmd${cur === cmd || (cmd === 'plot' && (cur === 'poach' || cur === 'envoy')) || (m && m.cmd === cmd) ? ' on' : ''}" data-g="${id}" data-cmd="${cmd}" ${can(cmd) ? '' : 'disabled'}>${t(CMD_KEY[cmd])}${prev[cmd] ? `<small>${prev[cmd]}</small>` : ''}</button>`).join('')}<button class="sgCmd${!o && !m ? ' on' : ''}" data-g="${id}" data-cmd="rest">${t('sgCmdRest')}</button></div>`;
      if (m && m.cmd === 'intercept') {
        h += `<p class="sgPick">${t('sgPickArmy')}</p><div class="sgChips">${E.interceptTargets(st, E.PLAYER, c).map((A) => `<button data-g="${id}" data-army="${A.id}">${esc(F('sgArmyChip', { f: this.fName(A.f), n: kNum(A.troops), to: cName(A.to) }))}${this.odds(c, null, id, A)}</button>`).join('')}<button data-a="cancel">${t('sgCancel')}</button></div>`;
      } else if (m && m.cmd === 'plot') {
        const KT = { rumor: ['sgRumor', 'sgRumorS'], fire: ['sgFire', 'sgFireS'], poach: ['sgPoach', 'sgPoachS'], envoy: ['sgEnvoy', 'sgEnvoyS'] }, extra = this.plotKinds(c, id);
        const kinds = [...(m.cities.length ? E.PLOTS : []), ...extra];
        h += `<p class="sgPick">${t('sgPickKind')}</p><div class="sgChips">${kinds.map((kd) => `<button data-g="${id}" data-kind="${kd}" class="${m.kind === kd ? 'on' : ''}">${t(KT[kd][0])} <small>${esc(F(KT[kd][1], { n: CFG.sg.envoyMonths }))} · ${E.costOf(kd === 'poach' || kd === 'envoy' ? kd : 'plot', id)}${zh() ? '金' : 'g'}</small></button>`).join('')}<button data-a="cancel">${t('sgCancel')}</button></div>`;
        if (m.kind === 'poach') h += `<p class="sgPick">${t('sgPickGen')}</p><div class="sgChips">${E.poachTargets(st, E.PLAYER, c).map((x) => `<button data-g="${id}" data-pg="${x}" ${E.validOrder(st, E.PLAYER, id, { cmd: 'poach', g: x }) ? '' : 'disabled'}>${esc(gName(x))} <small>${esc(cName(st.gens[x].c))} · ${t('sgLoyal')} ${st.gens[x].loyal ?? 70} · ${F('sgChance', { n: Math.round(E.poachChance(st, E.PLAYER, id, x) * 100) })}</small></button>`).join('') || `<small>${t('sgNoTarget')}</small>`}</div>`;
        else if (m.kind === 'envoy') h += `<p class="sgPick">${t('sgPickLord')}</p><div class="sgChips">${st.factions.filter((x) => x.id !== E.PLAYER && x.alive && !E.truceLeft(st, E.PLAYER, x.id)).map((x) => `<button data-g="${id}" data-ef="${x.id}" ${E.validOrder(st, E.PLAYER, id, { cmd: 'envoy', f: x.id }) ? '' : 'disabled'}><span class="sgDot" style="background:${x.color}"></span>${esc(this.fName(x.id))} <small>${F('sgChance', { n: Math.round(E.envoyChance(st, E.PLAYER, id, x.id) * 100) })}</small></button>`).join('') || `<small>${t('sgNoTarget')}</small>`}</div>`;
        else if (m.kind) h += `<div class="sgChips">${m.targets.map((n) => `<button data-g="${id}" data-to="${n}">${esc(cName(n))} <small>${F('sgChance', { n: Math.round(E.plotChance(st, id, n) * 100) })}</small></button>`).join('')}<button data-a="cancel">${t('sgCancel')}</button></div>`;
      } else if (m) {
        // v1.2 (D-104): take other officers of this city along; they get the same order and leave as one army
        const mates = gs.filter((x) => x !== id);
        if (mates.length && (m.cmd === 'march' || m.cmd === 'move')) h += `<p class="sgPick">${t(m.cmd === 'march' ? 'sgWith' : 'sgWithMove')}</p><div class="sgChips sgWith">${mates.map((x) => `<button data-g="${id}" data-with="${x}" class="${(m.with || []).includes(x) ? 'on' : ''}">${(m.with || []).includes(x) ? '✓ ' : ''}${esc(gName(x))} <small>${zh() ? '统' : 'L'}${E.gen(x).lead} ${zh() ? '武' : 'W'}${E.gen(x).war}</small></button>`).join('')}</div>`;
        h += `<p class="sgPick">${t('sgTargets')}</p><div class="sgChips">${m.targets.map((n) => `<button data-g="${id}" data-to="${n}">${esc(cName(n))}${m.cmd === 'march' ? this.odds(c, n, id) : ''} <small>${esc([F('sgMonths', { n: E.travelMonths(E.routeOf(st, E.PLAYER, c, n)) }), ...(m.cmd === 'march' ? this.terrTags(this.lastHop(c, n), n) : [])].join(' '))}</small></button>`).join('')}<button data-a="cancel">${t('sgCancel')}</button></div>`;
      } else if (o && (o.cmd === 'march' || o.cmd === 'move' || o.cmd === 'intercept')) {
        const av = Math.min(E.commandOf(id), this.avail(c, id)), opts = o.cmd === 'move' ? [0, 0.5, 1] : [0.5, 0.8, 1]; // 统率 caps the troops
        h += `<div class="sgSeg"><span>${t('sgMoveTroops')}</span>${opts.map((f) => { const n = Math.floor(av * f); return `<button data-g="${id}" data-n="${n}" class="${o.n === n ? 'on' : ''}">${kNum(n)}</button>`; }).join('')}</div>`;
      }
      h += '</div>';
    }
    return h;
  }
  // the extra stratagems an officer in city c could use now: poaching needs a target next door, a truce a lord to ask
  plotKinds(c, id) {
    const st = this.s, P = E.PLAYER, out = [];
    if (CITIES[c].pass) return out;
    if (E.poachTargets(st, P, c).length) out.push('poach');
    if (st.factions.some((x) => x.id !== P && x.alive && !E.truceLeft(st, P, x.id))) out.push('envoy');
    return out;
  }
  panelClick(e) {
    if (this.busy) return;
    const st = this.s, c = this.sel, b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a === 'close') { this.sel = null; this.mode = null; this.render(); return; }
    if (b.dataset.a === 'hide') { this.togglePanel(true); return; }
    if (b.dataset.a === 'cancel') { this.mode = null; this.render(); return; }
    const id = b.dataset.g;
    if (!c || !id || !st.gens[id]) return;
    if (b.dataset.kind && this.mode && this.mode.id === id) { this.mode.kind = b.dataset.kind; this.mode.targets = E.PLOTS.includes(b.dataset.kind) ? this.mode.cities : []; this.render(); return; }
    if (b.dataset.with && this.mode && this.mode.id === id) { const w = this.mode.with || (this.mode.with = []), x = b.dataset.with, k = w.indexOf(x); if (k >= 0) w.splice(k, 1); else w.push(x); this.render(); return; }
    if (b.dataset.pg) { st.orders[id] = { cmd: 'poach', g: b.dataset.pg }; this.mode = null; this.render(); return; }
    if (b.dataset.ef) { st.orders[id] = { cmd: 'envoy', f: +b.dataset.ef }; this.mode = null; this.render(); return; }
    if (b.dataset.army) { const av = Math.min(E.commandOf(id), this.avail(c, id)); st.orders[id] = { cmd: 'intercept', army: +b.dataset.army, n: Math.floor(av * 0.8) }; this.mode = null; this.render(); return; }
    if (b.dataset.to) { this.mode = this.mode && this.mode.id === id ? this.mode : { id, c, cmd: 'move', targets: [b.dataset.to] }; this.setTarget(b.dataset.to); return; }
    if (b.dataset.cmd) {
      const cmd = b.dataset.cmd;
      this.mode = null;
      if (cmd === 'rest') delete st.orders[id];
      else if (cmd === 'intercept') { delete st.orders[id]; this.mode = { id, c, cmd, targets: [] }; }
      else if (cmd === 'plot') {
        delete st.orders[id];
        const cities = ADJ[c].map((a) => a.c).filter((n) => E.validOrder(st, E.PLAYER, id, { cmd, kind: 'rumor', to: n }));
        this.mode = { id, c, cmd, kind: null, cities, targets: [] };
      } else if (cmd === 'march' || cmd === 'move') {
        const targets = (cmd === 'march' ? E.marchTargets(st, E.PLAYER, c).filter((n) => E.validOrder(st, E.PLAYER, id, { cmd, to: n })) : E.moveTargets(st, E.PLAYER, c)).sort((a, b) => E.travelMonths(E.routeOf(st, E.PLAYER, c, a)) - E.travelMonths(E.routeOf(st, E.PLAYER, c, b)));
        delete st.orders[id];
        this.mode = { id, c, cmd, targets, with: [] };
        if (targets.length === 1 && E.gensIn(st, c, E.PLAYER).length < 2) { this.setTarget(targets[0]); return; } // alone with one place to go: no need to ask
      } else st.orders[id] = { cmd };
      this.render(); return;
    }
    const o = st.orders[id];
    if (o && b.dataset.n !== undefined) { o.n = +b.dataset.n; this.render(); }
  }
  setTarget(to) {
    const st = this.s, m = this.mode, av = this.avail(m.c, m.id);
    st.orders[m.id] = m.cmd === 'plot' ? { cmd: 'plot', kind: m.kind || 'rumor', to } : { cmd: m.cmd, to, n: m.cmd === 'march' ? Math.floor(Math.min(E.commandOf(m.id), av) * 0.8) : 0 };
    // the officers picked to come along get the same order, each with his share of what is left (v1.2, D-104)
    if (m.cmd === 'march' || m.cmd === 'move') {
      const left = [];
      for (const w of m.with || []) {
        if (!st.gens[w] || st.gens[w].c !== m.c) continue;
        const o = { cmd: m.cmd, to, n: m.cmd === 'march' ? Math.floor(Math.min(E.commandOf(w), this.avail(m.c, w)) * 0.8) : 0 };
        if ((m.cmd === 'march' && o.n < CFG.sg.minMarch) || !E.validOrder(st, E.PLAYER, w, o)) { left.push(gName(w)); continue; }
        st.orders[w] = o;
      }
      if (left.length) this.toast(F('sgWithLeft', { g: left.join(zh() ? '、' : ', ') }));
    }
    this.sel = m.c; this.mode = null; this.render();
  }
  autoAssign() {
    if (this.busy) return;
    const st = this.s, before = Object.keys(st.orders).length;
    st.orders = E.autoAssign(st, st.orders);
    const n = Object.keys(st.orders).length - before;
    this.mode = null; this.render();
    this.toast(n ? F('sgAutoDone', { n }) : t('sgAutoNone'));
  }
  toast(msg) {
    const el = $('sgToast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------------- the month
  // v1.2: nothing a card or an animation does may leave the game locked. Every wait on the screen goes through
  // ui(): an error in it is logged and skipped, and a wait whose card has vanished is given up after a few seconds.
  async ui(fn, fallback = null) {
    let timer = 0;
    try {
      return await Promise.race([
        Promise.resolve().then(fn),
        new Promise((res) => {
          let idle = 0;
          timer = setInterval(() => {
            const shown = $('sgLayer').classList.contains('show');
            idle = shown || this.tween ? 0 : idle + 1;
            if (idle >= 16) res(fallback); // 8 s with no card and no camera move: whatever we waited for is gone
          }, 500);
        }),
      ]);
    } catch (err) {
      console.error('sg ui:', err);
      const L = $('sgLayer'); L.className = ''; L.innerHTML = '';
      return fallback;
    } finally { clearInterval(timer); }
  }
  async endMonth() {
    if (this.busy) return;
    const st = this.s;
    this.busy = true; this.mode = null;
    this.skipFx = false;
    let ended = false, evs = [];
    try {
      try { sfx.drum(2); sfx.setBgmMood('battle'); } catch (e) { /* sound must never stop the month */ }
      E.beginTurn(st, st.orders);
      for (let b = E.nextBattle(st); b; b = E.nextBattle(st)) {
        const to = b.m.to, mine = b.m.field ? b.m.f === E.PLAYER || b.m.fb === E.PLAYER : b.m.f === E.PLAYER || st.cities[to].owner === E.PLAYER, fd = b.m.field ? b.m.fb : st.cities[to].owner;
        if (mine) await this.ui(() => this.battleIntro(b));
        let win = null;
        if (b.duel) {
          const yours = b.duel.fa === E.PLAYER || b.duel.fd === E.PLAYER;
          if (yours) win = await this.ui(() => this.duelUI(b.duel), undefined);
          if (!yours || win === undefined || !b.duel.done) win = E.autoDuel(st, b.duel);
        }
        E.resolveBattle(st, b.m, win, b.duel);
        const res = [...st.events].reverse().find((e) => (b.m.field ? e.k === 'field' : e.k === 'take' || e.k === 'repel') && e.c === to);
        if (mine && b.m.rounds && res) await this.ui(() => this.battleScreen(b, res, fd));
        if (mine && res) await this.ui(() => this.battleResult(b, res, fd));
        else if (!mine) this.fx.push({ type: 'puff', c: to, at: b.m.at, t0: performance.now(), dur: 900, ca: this.fColor(b.m.f) });
      }
      evs = E.endTurn(st); ended = true;
      st.orders = {};
      for (const e of evs) if ((e.k === 'found' || e.k === 'recruit') && e.f === E.PLAYER) await this.ui(() => this.reveal(e.g, t(e.k === 'found' ? 'sgBlind' : 'sgDuel'), F(e.k === 'found' ? 'sgJoined' : 'sgRecruited', { g: gName(e.g) })));
      for (const e of evs) if (e.k === 'item' && e.f === E.PLAYER) await this.ui(() => this.itemReveal(e));
      this.render();
      await this.ui(() => this.report(evs));
      try { sfx.setBgmMood('calm'); } catch (e) { /* ignore */ }
      if (st.over) await this.ui(() => this.gameOver());
    } catch (err) {
      // the rules themselves failed part-way: finish the month without the show so the game can go on
      console.error('sg month:', err);
      try {
        if (!ended) { for (let b = E.nextBattle(st), n = 0; b && n < 200; b = E.nextBattle(st), n++) E.resolveBattle(st, b.m, b.duel ? E.autoDuel(st, b.duel) : null, b.duel); E.endTurn(st); st.orders = {}; }
      } catch (e2) { console.error('sg month recovery:', e2); }
      const L = $('sgLayer'); L.className = ''; L.innerHTML = '';
      this.toast(t('sgOops'));
    } finally {
      this.busy = false; this.tween = null;
      try { this.render(); } catch (e) { console.error(e); }
    }
  }

  // battle playback (v0.9.4): the camera flies to a battle you are in, swords clash, then the result.
  // A tap on the map skips ahead.
  wait(ms) {
    return new Promise((res) => { const t0 = performance.now(); let done = false; const fin = () => { if (!done) { done = true; res(); } }; const tick = () => { if (done) return; if (this.skipFx || performance.now() - t0 >= ms) fin(); else requestAnimationFrame(tick); }; tick(); setTimeout(fin, ms + 400); });
  }
  async battleIntro(b) {
    const m = b.m, C = m.at || CITIES[m.to], k1 = Math.max(this.k, this.s0 * 1.25);
    if (!this.skipFx) { this.tween = { x0: this.cx, z0: this.cz, k0: this.k, x1: C.x, z1: C.z, k1, t0: performance.now(), dur: 450 }; await this.wait(480); }
    sfx.clash(); this.shake = 10;
    const other = m.field ? m.b.troops : this.s.cities[m.to].troops, ob = m.field ? m.fb : this.s.cities[m.to].owner;
    this.fx.push({ type: 'clash', c: m.to, at: m.at, t0: performance.now(), dur: 900, ca: this.fColor(m.f), cb: this.fColor(ob), text: `${m.field ? (zh() ? '野战 ' : 'Field ') : ''}${kNum(m.troops)} ⚔ ${kNum(other)}` });
    setTimeout(() => sfx.clash(0.7), 280);
    await this.wait(900);
  }
  // the battle screen (v0.9.7): your officers on the left, theirs on the right, troop bars running down
  // round by round as the battle was fought; a tap skips to the end
  async battleScreen(b, res, fd) {
    const st = this.s, P = E.PLAYER, m = b.m, rounds = m.rounds, mineLeft = m.f === P;
    const [gA, gB] = m.sideGens, [fA, fB] = [m.f, m.field ? m.fb : fd];
    const left = mineLeft ? 0 : 1, sides = [[gA, fA], [gB, fB]];
    const where = m.field ? `${cName(m.to)} ${zh() ? '城外' : 'outskirts'}` : cName(m.to), [w, ic] = weatherOf(st);
    const col = (si) => {
      const [gs, f] = sides[si], t0 = rounds[0][si], cmd = E.commandOfAll(gs) || 1;
      const cards = gs.length ? gs.slice(0, 3).map((g, i) => tallCard(g, { troops: Math.round(t0 * E.commandOf(g) / cmd), pct: 100, data: `data-bi="${si}-${i}"` })).join('')
        : `<div class="sgCardT tR kqun garrison"><b class="sgCglyph">${zh() ? '守' : 'G'}</b><span class="sgCname">${t('sgGarrisonCard')}</span><i class="sgCbar"><b style="width:100%"></b></i><em class="sgCtroops">${kNum(t0)}</em></div>`;
      return `<div class="sgBside${si === left ? ' me' : ''}"><div class="sgBhead"><b style="color:${this.fColor(f)}">${esc(this.fName(f))}</b><i class="sgBtotal"><b data-bt="${si}" style="width:100%;background:${this.fColor(f)}"></b></i><em data-bn="${si}">${kNum(t0)}</em></div><div class="sgBcards">${cards}</div></div>`;
    };
    const L = $('sgLayer');
    L.className = 'show battle';
    L.innerHTML = `<div class="sgCard sgBattle charge"><h2 class="sgCenter">${esc(where)} · ${ic} ${zh() ? w : WEATHER_EN[w]}</h2>
      <div class="sgBrow">${col(left)}<span class="sgVs">VS</span>${col(1 - left)}</div><p class="sgCenter sgBres"></p><button class="sgBig" data-ok="1" style="visibility:hidden">${t('sgContinue')}</button></div>`;
    let skip = false;
    const onTap = () => { skip = true; };
    L.addEventListener('pointerdown', onTap);
    const set = (r) => {
      for (const si of [0, 1]) {
        const t0 = Math.max(1, rounds[0][si]), v = r[si], pct = v / t0 * 100, gs = sides[si][0], cmd = E.commandOfAll(gs) || 1;
        const bar = L.querySelector(`[data-bt="${si}"]`); if (bar) bar.style.width = pct + '%';
        const n = L.querySelector(`[data-bn="${si}"]`); if (n) n.textContent = kNum(v);
        gs.slice(0, 3).forEach((g, i) => { const c = L.querySelector(`[data-bi="${si}-${i}"]`); if (!c) return; c.querySelector('.sgCbar b').style.width = pct + '%'; c.querySelector('.sgCtroops').textContent = kNum(v * E.commandOf(g) / cmd); });
        if (!gs.length) { const c = L.querySelector(`.sgBside${si === left ? '.me' : ':not(.me)'} .garrison`); if (c) { c.querySelector('.sgCbar b').style.width = pct + '%'; c.querySelector('.sgCtroops').textContent = kNum(v); } }
      }
    };
    if (!this.skipFx) await new Promise((r) => setTimeout(r, 520)); // the charge
    const acc = [0, 0], floatLoss = (si) => {
      if (acc[si] < 1) return;
      const head = L.querySelectorAll('.sgBside')[si === left ? 0 : 1]?.querySelector('.sgBhead');
      if (head) { const el = document.createElement('i'); el.className = 'sgLoss'; el.textContent = '-' + kNum(acc[si]); head.appendChild(el); setTimeout(() => el.remove(), 900); }
      acc[si] = 0;
    };
    for (let i = 1; i < rounds.length && !skip && !this.skipFx; i++) {
      set(rounds[i]);
      const lost = [rounds[i - 1][0] - rounds[i][0], rounds[i - 1][1] - rounds[i][1]];
      acc[0] += lost[0]; acc[1] += lost[1];
      if (i % 5 === 0) { floatLoss(0); floatLoss(1); }
      for (const si of [0, 1]) if (lost[si] > rounds[0][si] * 0.06) { const side = L.querySelectorAll('.sgBside')[si === left ? 0 : 1]; side.classList.remove('hit'); void side.offsetWidth; side.classList.add('hit'); }
      if (i % 3 === 1) sfx.clash(0.5);
      await new Promise((r) => setTimeout(r, 110));
    }
    set(rounds[rounds.length - 1]);
    L.removeEventListener('pointerdown', onTap);
    const youWon = res ? (res.k === 'field' ? res.f === P : res.k === 'take' ? m.f === P : fd === P) : false;
    const txt = !res ? '' : res.k === 'field' ? t(youWon ? 'sgFxField' : 'sgFxFieldLost') : res.k === 'take' ? t(m.f === P ? 'sgFxTake' : 'sgFxLost') : t(fd === P ? 'sgFxHeld' : 'sgFxRepelled');
    const out = L.querySelector('.sgBres'); out.textContent = txt; out.className = 'sgCenter sgBres stamp ' + (youWon ? 'won' : 'lost');
    const sidesEl = L.querySelectorAll('.sgBside'), last = rounds[rounds.length - 1], leftWon = res ? youWon : last[left] >= last[1 - left];
    if (sidesEl.length === 2) { sidesEl[0].classList.add(leftWon ? 'victor' : 'beaten'); sidesEl[1].classList.add(leftWon ? 'beaten' : 'victor'); }
    L.querySelector('[data-ok]').style.visibility = 'visible';
    sfx.fanfare(youWon);
    await new Promise((res2) => { const h = (e) => { if (!e.target.closest('[data-ok]')) return; L.removeEventListener('click', h); L.className = ''; L.innerHTML = ''; res2(); }; L.addEventListener('click', h); });
    b.shown = true; // the map banner afterwards stays short
  }
  // the 将 page (v0.9.7): tabs on the left (all / by kingdom / enemy officers), a grid of cards, and a detail page
  openGenerals() {
    if (this.busy) return;
    const st = this.s, P = E.PLAYER, L = $('sgLayer');
    let tab = 'all', detail = null;
    const mine = () => E.byLead(E.factionGens(st, P)), foes = () => Object.values(st.gens).filter((g) => !g.hidden && g.f !== P && (g.f >= 0 || g.guard)).map((g) => g.id);
    const where = (id) => { const G = st.gens[id]; return G.guard ? `${cName(G.c)} · ${t('sgGuard')}` : G.c ? cName(G.c) : this.armyOf(id) ? F('sgMarching', { to: cName(this.armyOf(id).to), eta: this.eta(this.armyOf(id)) }) : t('sgOnRoad'); };
    const paint = () => {
      if (detail) {
        const g = E.gen(detail), G = st.gens[detail], tr = TRAITS[g.trait], bonds = BONDS.filter((x) => x.m.includes(detail));
        const row = (k, v) => `<div class="sgDrow"><span>${k}</span><b>${v}</b><i>›</i></div>`;
        const stat = (l, v) => `${v} <u class="g${grade(v)}">${grade(v)}</u>`;
        L.innerHTML = `<div class="sgCard sgPage"><div class="sgPhead"><button class="sgBack" data-back="1">‹</button><b>${esc(gName(detail))}</b><button class="sgX" data-ok="1">✕</button></div>
          <div class="sgDetail">${tallCard(detail, { big: true })}<div class="sgDlist">
          ${bio(detail)}
          ${row(zh() ? '统率' : 'Leadership', stat('', g.lead) + ` · ${zh() ? '带兵' : 'leads'} ≤${kNum(E.commandOf(detail))} · ${zh() ? '征兵' : 'drafts'} +${kNum(E.draftAmt(detail))}`)}
          ${row(zh() ? '武力' : 'War', stat('', g.war) + ` · ${zh() ? '战斗力' : 'fighting'} ×${(g.war / 100).toFixed(2)}`)}
          ${row(zh() ? '智力' : 'Intellect', stat('', g.int) + ` · ${zh() ? '搜索' : 'search'} ${Math.round(E.searchChance(st, P, detail) * 100)}%`)}
          ${row(zh() ? '政治' : 'Politics', stat('', g.pol) + ` · ${zh() ? '内政' : 'develop'} +${E.devAmt(st, P, detail)} · ${zh() ? '花费' : 'costs'} ×${(E.costOf('dev', detail) / CFG.sg.devCost).toFixed(2)}`)}
          ${row(zh() ? '特技' : 'Trait', `${esc(zh() ? tr[0] : tr[1])} · ${esc(zh() ? tr[2] : tr[3])}`)}
          ${bonds.length ? row(t('sgBonds'), bonds.map((x) => esc(zh() ? x.zh : x.en)).join('、')) : ''}
          ${G.f >= 0 ? row(t('sgLoyal'), `${G.loyal ?? 70} <small>${t('sgLoyalS')}</small>`) : ''}
          ${G.item ? row(t('sgItem'), `${ITEMS[G.item].glyph} ${esc(iName(G.item))} · ${esc(itemFxText(G.item))}`) : ''}
          ${G.item && G.f === P ? `<div class="sgChips sgGive"><span>${t('sgItemGive')}</span>${mine().filter((x) => x !== detail).map((x) => `<button data-give="${x}">${esc(gName(x))}${E.itemOf(x) ? ' ⇄' : ''}</button>`).join('')}</div>` : ''}
          ${row(zh() ? '所在' : 'Where', esc(where(detail)))}
          ${G.f === P ? row(t('sgOrder'), esc(st.orders[detail] ? this.orderText(st.orders[detail]) : t('sgCmdRest'))) : row(t('sgOwner'), esc(this.fName(G.f)))}
          </div></div></div>`;
        return;
      }
      // a Three Kingdoms game sorts by kingdom; an all-eras game by era (only the eras this game has)
      const sg = st.roster !== 'mix', key = (id) => (sg ? GENERALS[id].k : GENERALS[id].era);
      const list = (tab === 'foe' ? foes() : mine()).filter((id) => tab === 'all' || tab === 'foe' || key(id) === tab);
      const groups = sg ? [['wei', '魏', 'Wei'], ['shu', '蜀', 'Shu'], ['wu', '吴', 'Wu'], ['qun', '群', 'Qun']]
        : Object.entries(ERAS).filter(([e]) => Object.keys(st.gens).some((id) => GENERALS[id].era === e)).map(([e, v]) => [e, v[2], v[3]]);
      const tabs = [['all', zh() ? '全部' : 'All'], ...groups.map(([k, a, b]) => [k, zh() ? a : b]), ['foe', zh() ? '敌将' : 'Enemy']];
      L.innerHTML = `<div class="sgCard sgPage"><div class="sgPhead"><b>${t('sgOfficersBtn')} · ${mine().length}</b><button class="sgX" data-ok="1">✕</button></div>
        <div class="sgPbody"><div class="sgTabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="sgGrid2">${list.map((id) => tallCard(id, { data: `data-gid="${id}"` })).join('') || `<p class="sgHint">${t('sgNone')}</p>`}</div></div></div>`;
    };
    L.className = 'show page';
    paint();
    const h = (e) => {
      const b = e.target.closest('[data-tab],[data-gid],[data-back],[data-ok],[data-give]');
      if (!b) return;
      if (b.dataset.give) { E.passItem(st, detail, b.dataset.give); this.save(); this.render(); paint(); return; }
      if (b.dataset.ok) { L.removeEventListener('click', h); L.className = ''; L.innerHTML = ''; return; }
      if (b.dataset.back) detail = null;
      else if (b.dataset.tab) tab = b.dataset.tab;
      else if (b.dataset.gid) detail = b.dataset.gid;
      paint();
    };
    L.addEventListener('click', h);
  }
  async battleResult(b, res, fd) {
    if (!res) return;
    const P = E.PLAYER, at = b.m.at;
    let youWon, text, took = false;
    if (res.k === 'field') { youWon = res.f === P; text = youWon ? t('sgFxField') : t('sgFxFieldLost'); took = true; }
    else { took = res.k === 'take'; youWon = took ? b.m.f === P : fd === P; text = took ? (b.m.f === P ? t('sgFxTake') : t('sgFxLost')) : (fd === P ? t('sgFxHeld') : t('sgFxRepelled')); }
    if (took) { this.fx.push({ type: 'burst', c: b.m.to, at, t0: performance.now(), dur: 700, ca: this.fColor(res.f) }); this.shake = 14; }
    this.fx.push({ type: 'banner', c: b.m.to, at, t0: performance.now(), dur: 1300, ca: youWon ? '#f2c14e' : '#ff8a80', text });
    if (!b.shown) sfx.fanfare(youWon);
    await this.wait(b.shown ? 350 : 1100);
  }
  // one line of the report; a line that cannot be written is left out instead of breaking the report
  evLine(e) { try { return this.evText(e); } catch (err) { console.error('sg event:', e && e.k, err); return null; } }
  evText(e) {
    const st = this.s, P = E.PLAYER, f = this.fName(e.f ?? -1);
    switch (e.k) {
      case 'dev': return e.f === P ? F('evDev', { c: cName(e.c), g: gName(e.g), n: e.n }) : null;
      case 'draft': return e.f === P ? F('evDraft', { c: cName(e.c), g: gName(e.g), n: e.n }) : null;
      case 'fort': return e.f === P ? F('evFort', { c: cName(e.c), g: gName(e.g), n: e.n }) : null;
      case 'skip': return e.f === P ? F('evSkip', { g: gName(e.g) }) : null;
      case 'found': return e.f === P ? F('evFound', { c: cName(e.c), by: gName(e.by), g: gName(e.g) }) : F('evFoundAI', { f, c: cName(e.c), g: gName(e.g) });
      case 'item': return e.f === P ? F('evItem', { c: cName(e.c), g: gName(e.g), i: iName(e.item) }) : F('evItemAI', { f, c: cName(e.c), i: iName(e.item) });
      case 'poach': return e.ok ? (e.from === P ? F('evPoachedYou', { t: gName(e.who), f }) : F('evPoachOk', { g: gName(e.g), t: gName(e.who), from: this.fName(e.from), f })) : e.f === P || e.from === P ? F('evPoachNo', { g: gName(e.g), t: gName(e.who) }) : null;
      case 'truce': return e.ok ? F('evTruceOk', { g: gName(e.g), f, to: this.fName(e.to), n: e.n }) : e.f === P ? F('evTruceNo', { g: gName(e.g), to: this.fName(e.to) }) : null;
      case 'truceEnd': return e.f === P || e.to === P ? F('evTruceEnd', { f, to: this.fName(e.to) }) : null;
      case 'treasure': return e.f === P ? F('evTreasure', { c: cName(e.c), n: e.n }) : null;
      case 'nothing': return e.f === P ? F('evNothing', { c: cName(e.c) }) : null;
      case 'move': return e.f === P ? F('evMove', { g: gName(e.gens[0]), c: cName(e.c), to: cName(e.to), n: e.n, m: e.months || 1 }) : null;
      case 'blocked': return e.f === P || e.fd === P ? F('evBlocked', { g: e.gens.map(gName).join('、'), c: cName(e.c), to: cName(e.to) }) : null;
      case 'arrive': return e.f === P ? F('evArrive', { g: e.gens.map(gName).join('、'), c: cName(e.c), n: e.n }) : null;
      case 'march': return e.f === P || st.cities[e.to].owner === P || (e.to && st.factions.some((x) => x.player && x.cap === e.to)) ? F('evMarch', { f, c: cName(e.c), to: cName(e.to), n: e.n.toLocaleString(), m: e.months || 1 }) : null;
      case 'duel': return F('evDuel', { a: gName(e.a), d: gName(e.d), w: e.win ? F('evDuelWon', { g: gName(e.win === 'a' ? e.a : e.d) }) : t('evDuelDraw') });
      case 'take': return F(e.pass ? 'evTakePass' : 'evTake', { f, c: cName(e.c) });
      case 'field': return F('evField', { w: this.fName(e.f), l: this.fName(e.fl), lw: this.fName(e.f), ll: this.fName(e.fl), c: cName(e.c), a: kNum(e.lostW), b: kNum(e.lostL) });
      case 'intercept': return e.f === P || e.fb === P ? F('evIntercept', { g: gName(e.g), c: cName(e.c), f: this.fName(e.fb) }) : null;
      case 'plot': return e.f === P || e.fd === P ? F((e.kind === 'fire' ? 'evFire' : 'evRumor') + (e.ok ? 'Ok' : 'No'), { g: gName(e.g), to: cName(e.to), n: e.n }) : null;
      case 'event': return F('ev_' + e.id, { f: e.f >= 0 ? this.fName(e.f) : '', c: e.c ? cName(e.c) : '', g: e.g ? gName(e.g) : '', n: e.n });
      case 'harvest': return t('evHarvest');
      case 'repel': return e.f === P || e.fd === P ? F('evRepel', { c: cName(e.c), f }) : null;
      case 'flee': return e.f === P || e.by === P ? F('evFlee', { g: gName(e.g), c: cName(e.c) }) : null;
      case 'recruit': return F('evRecruit', { f, g: gName(e.g) });
      case 'release': return e.f === P || e.from === P ? F('evRelease', { g: gName(e.g) }) : null;
      case 'newlord': return F('evNewLord', { g: gName(e.g) });
      case 'fall': return F('evFall', { f: this.fName(e.f) });
      case 'capital': return F('evCapital', { f, c: cName(e.c) });
      case 'cut': return e.f === P ? F('evCut', { c: cName(e.c) }) : null;
      case 'hunger': return e.f === P ? F('evHunger', { f }) : null;
      case 'coalition': return e.f === P ? t('evCoalitionYou') : F('evCoalition', { f });
      case 'coalitionEnd': return e.f >= 0 ? F('evCoalitionEnd', { f }) : null;
      default: return null;
    }
  }
  layer(html, cls = '') {
    const L = $('sgLayer');
    if (this.layerDrop) this.layerDrop(); // a card still waiting gives way (v1.2: it used to wait for ever)
    L.className = 'show ' + cls; L.innerHTML = `<div class="sgCard">${html}</div>`;
    return new Promise((res) => {
      const h = (e) => { const b = e.target.closest('[data-ok]'); if (!b) return; L.removeEventListener('click', h); this.layerDrop = null; L.className = ''; L.innerHTML = ''; res(b.dataset.ok); };
      this.layerDrop = () => { L.removeEventListener('click', h); this.layerDrop = null; res(null); };
      L.addEventListener('click', h);
    });
  }
  async report(evs) {
    const lines = evs.map((e) => [e, this.evLine(e)]).filter(([, x]) => x);
    const imp = (e) => ['take', 'fall', 'coalition', 'coalitionEnd', 'duel', 'cut', 'hunger', 'found', 'recruit', 'event', 'harvest', 'plot', 'item', 'poach', 'truce', 'truceEnd'].includes(e.k);
    await this.layer(`<h2>${t('sgReport')} · ${dateText({ turn: this.s.turn - 1 })}</h2>
      <ul class="sgEv">${lines.length ? lines.map(([e, x]) => `<li class="${imp(e) ? 'imp' : ''}${e.f === E.PLAYER ? ' me' : ''}">${esc(x)}</li>`).join('') : `<li>${t('sgQuiet')}</li>`}</ul>
      <button class="sgBig" data-ok="1">${t('sgContinue')}</button>`);
  }
  showLog() {
    if (this.busy) return;
    const lines = [...this.s.log].reverse().map((e) => [e, this.evLine(e)]).filter(([, x]) => x);
    this.layer(`<h2>${t('sgLog')}<button class="sgX" data-ok="1">✕</button></h2><ul class="sgEv">${lines.map(([e, x]) => { const d = E.dateOf({ turn: e.t }); return `<li><small>${d.year}.${d.month}</small> ${esc(x)}</li>`; }).join('') || `<li>${t('sgQuiet')}</li>`}</ul>`);
  }
  reveal(g, title, line) {
    const tr = tierOf(g);
    sfx.sparkle(); if (tr === 'UR' || tr === 'SSR') setTimeout(() => sfx.fanfare(true), 350);
    const bonds = BONDS.filter((b) => b.m.includes(g)).map((b) => `<div class="sgBond">${esc(zh() ? b.zh : b.en)}：${b.m.map((x) => esc(gName(x))).join(' · ')}</div>`).join('');
    return this.layer(`<h2 class="sgCenter">${esc(title)}</h2><div class="sgReveal">${portrait(g, 96)}<div><div class="sgBigName">${esc(gName(g))}</div>${statBars(g)}<div class="sgTrw">${traitTag(g)}</div>${bonds}${bio(g)}</div></div>
      <p class="sgCenter">${esc(line)}</p><button class="sgBig" data-ok="1">${t('sgContinue')}</button>`, 'flip r' + tr);
  }
  // a treasure blind box (v1.1): the card flips over like an officer's
  itemReveal(e) {
    const tr = ITEMS[e.item].tier;
    sfx.sparkle(); if (tr !== 'SR') setTimeout(() => sfx.fanfare(true), 350);
    return this.layer(`<h2 class="sgCenter">${t('sgItemBox')}</h2><div class="sgReveal item">${itemCard(e.item)}<div><div class="sgBigName">${esc(iName(e.item))}</div><p>${esc(F('sgItemGot', { g: gName(e.g), c: cName(e.c) }))}</p>
      <div class="sgTrw"><span class="sgTr">${esc(itemFxText(e.item))}</span></div><p class="sgHint">${esc(F('sgItemTo', { g: gName(e.to) }))}</p></div></div><button class="sgBig" data-ok="1">${t('sgContinue')}</button>`, 'flip r' + tr);
  }
  async intro() {
    const st = this.s;
    await this.reveal(E.factionGens(st, E.PLAYER)[0], t('sgBlindStart'), F('sgJoined', { g: gName(E.factionGens(st, E.PLAYER)[0]) }));
    await this.reveal(E.factionGens(st, E.PLAYER)[1], t('sgBlindStart'), F('sgJoined', { g: gName(E.factionGens(st, E.PLAYER)[1]) }));
    const [a, b, c] = [1, 2, 3].map((f) => this.fName(f));
    await this.layer(`<h2>${t('sgRivals')}</h2><div class="sgRivals">${[1, 2, 3].map((f) => `<div>${portrait(st.factions[f].lord, 56)}<b style="color:${st.factions[f].color}">${esc(this.fName(f))}</b><small>📍 ${esc(cName(st.factions[f].cap))}</small></div>`).join('')}</div>
      <p>${esc(F('sgIntro', { a, b, c, p: cName(PASS_IDS.find((x) => CITIES[x].big) || PASS_IDS[0]) }))}</p><button class="sgBig" data-ok="1">${t('sgContinue')}</button>`);
    this.sel = st.factions[E.PLAYER].cap; this.focus(this.sel); this.render();
    this.tutorial(false);
  }
  // the first-game guide (v1.1): six short notes, each pointing at the thing it talks about. Shown once
  // per browser (and again from the menu); nothing is locked while it shows
  tutorial(force) {
    let seen = false;
    try { seen = localStorage.getItem('p905sgtut') === '1'; } catch (e) { /* ignore */ }
    if (seen && !force) return;
    const st = this.s, box = $('sgTut');
    const steps = [['sgTut1', '#sgPanel h3'], ['sgTut2', '.sgCmd[data-cmd="search"]'], ['sgTut3', '#sgAuto'], ['sgTut4', '.sgCmd[data-cmd="march"]'], ['sgTut5', '.sgCmd[data-cmd="plot"]'], ['sgTut6', '#sgEnd']];
    let i = 0;
    const clear = () => { for (const el of document.querySelectorAll('.sgTutHi')) el.classList.remove('sgTutHi'); };
    const show = () => {
      clear();
      if (this.panelHidden) this.togglePanel(false);
      if (this.sel !== st.factions[E.PLAYER].cap && i < 5) { this.sel = st.factions[E.PLAYER].cap; this.mode = null; this.render(); }
      const el = document.querySelector(steps[i][1]);
      if (el) { el.classList.add('sgTutHi'); if (el.closest('#sgPanel')) el.scrollIntoView({ block: 'nearest' }); }
      box.innerHTML = `<b>${i + 1}/${steps.length}</b><p>${esc(t(steps[i][0]))}</p><div><button data-tut="skip">${t('sgTutSkip')}</button><button class="go" data-tut="next">${t(i === steps.length - 1 ? 'sgTutDone' : 'sgTutNext')}</button></div>`;
      box.className = 'show'; box.style.left = (this.panelHidden ? 60 : this.panelW + 24) + 'px';
    };
    box.onclick = (e) => {
      const b = e.target.closest('[data-tut]');
      if (!b) return;
      if (b.dataset.tut === 'next' && ++i < steps.length) { show(); return; }
      clear(); box.className = ''; box.innerHTML = '';
      try { localStorage.setItem('p905sgtut', '1'); } catch (err) { /* ignore */ }
    };
    show();
  }
  // the duel (v0.9.9, D-86): the opponent takes a stance, you read it and answer. Your 智力 against his
  // says whether the stance can be trusted; 斗志 pays for 必杀; a big gap in 武力 ends it in one blow
  duelUI(d) {
    const st = this.s, R = d.reader, me = R === 'a' ? d.a : d.d, foe = R === 'a' ? d.d : d.a, k = CFG.sg;
    const hpOf = (g) => (g === d.a ? [d.hpA, d.maxA, d.spA] : [d.hpD, d.maxD, d.spD]);
    const L = $('sgLayer');
    L.className = 'show duel';
    const stance = () => {
      const lines = STANCES[d.tell][zh() ? 0 : 1], line = lines[(d.n + st.turn) % lines.length];
      const gm = E.gen(me), gf = E.gen(foe);
      const trust = d.feintP <= 0 ? `<i class="sgTrust ok">🔍 ${esc(F('sgTrustOk', { a: gm.int, b: gf.int }))}</i>`
        : `<i class="sgTrust warn">⚠ ${esc(F('sgTrustWarn', { a: gm.int, b: gf.int, n: Math.round(d.feintP * 100) }))}</i>`;
      return `<div class="sgStance s${d.tell}"><b>${esc(F(line, { g: gName(foe) }))}</b><small>${esc(t('sgLooks' + d.tell))}</small>${trust}</div>`;
    };
    const MV = { atk: ['sgAtk', '⚔'], def: ['sgDefM', '🛡'], skill: ['sgSkill', '✦'] };
    const paint = (msg, hitMe = 0, hitFoe = 0, big = false, fxr = null) => {
      // fxr: the round just fought { my, foe, won } -> what each card does (v1.1, D-100)
      const anim = (mine) => {
        if (!fxr) return '';
        const mv = mine ? fxr.my : fxr.foe, hit = mine ? hitMe : hitFoe, dealt = mine ? hitFoe : hitMe;
        return ` mv-${mv}${mv !== 'def' && dealt ? ' lunge' : mv === 'def' ? ' brace' : ' whiff'}${hit ? ' hit' : ''}${d.done && d.win ? ((d.win === R) === mine ? ' win' : ' lose') : ''}`;
      };
      const stamp = (mine) => (fxr ? `<i class="sgMv ${mine ? fxr.my : fxr.foe}">${MV[mine ? fxr.my : fxr.foe][1]} ${t(MV[mine ? fxr.my : fxr.foe][0])}</i>` : '');
      const side = (g, col, hit, mine) => {
        const [hp, max, sp] = hpOf(g), G = E.gen(g);
        const bars = `<span><i class="sgHp"><b style="width:${hp / max * 100}%;background:${col}"></b></i><em>${hp}</em></span>
            <span><i class="sgSp"><b style="width:${sp}%"></b></i><small class="sgSpN">${t('sgSpirit')} ${sp}</small></span>`;
        return `<div class="sgDs dc ${mine ? 'me' : 'foe'}${hp <= 0 ? ' ko' : ''}${anim(mine)}"><div class="sgDc">${tallCard(g)}${stamp(mine)}${hit ? `<i class="sgDmg">-${hit}</i>` : ''}${hp <= 0 ? '<i class="sgKo">★ ★ ★</i>' : ''}${d.done && d.win && (d.win === R) === mine ? `<i class="sgSeal">${zh() ? '胜' : 'WIN'}</i>` : ''}</div>
          <div class="sgDi"><b>${esc(gName(g))}</b><small>${zh() ? `武${G.war} 智${G.int} 统${G.lead}` : `W${G.war} I${G.int} L${G.lead}`}</small>${bars}</div></div>`;
      };
      const can = E.canSkill(d, R);
      const btns = d.done
        ? `<button class="sgBig" data-dm="ok">${t('sgContinue')}</button>`
        : `${stance()}<div class="sgDm"><button data-dm="atk">${t('sgAtk')}</button><button data-dm="def">${t('sgDefM')}</button><button data-dm="skill"${can ? '' : ' disabled'}>${t('sgSkill')}<small>${F('sgSkillCost', { n: k.duelSkillCost })}</small></button></div>
          <p class="sgRule">${t('sgDuelRule')} · <button class="sgLink" data-dm="auto">${t('sgDuelAuto')}</button></p>`;
      const gap = E.gen(d.a).war - E.gen(d.d).war, ko = Math.abs(gap) >= k.duelKoGap && d.n === 0 && !d.done ? `<p class="sgCenter sgKoWarn">${esc(F('sgKoGap', { g: gName(gap > 0 ? d.a : d.d) }))}</p>` : '';
      L.innerHTML = `<div class="sgCard${big ? ' jolt' : ''}"><h2 class="sgCenter">${t('sgDuel')} <small>${d.rival ? esc(F('sgRival', { r: zh() ? d.rival : d.rivalEn })) + ' · ' : ''}${F('sgRound', { n: Math.min(d.n + 1, k.duelRounds) })}/${k.duelRounds}</small></h2>
        <div class="sgDuel arena">${side(me, '#2f7de1', hitMe, true)}<span class="sgVs${fxr && (hitMe || hitFoe) ? (fxr.my === 'skill' || fxr.foe === 'skill' ? ' burst' : ' slash') : fxr ? ' clink' : ''}">VS</span>${side(foe, '#d64545', hitFoe, false)}</div>
        ${ko}${msg ? `<p class="sgCenter sgMsg">${msg}</p>` : ''}${btns}</div>`;
    };
    paint(this.small ? '' : esc(F('sgDuelVs', { a: gName(d.a), d: gName(d.d) })));
    return new Promise((res) => {
      const h = (e) => {
        const b = e.target.closest('[data-dm]');
        if (!b || b.disabled) return;
        if (b.dataset.dm === 'ok') { L.removeEventListener('click', h); L.className = ''; L.innerHTML = ''; res(d.win); return; }
        const auto = b.dataset.dm === 'auto';
        do {
          E.duelRound(st, d, auto ? null : b.dataset.dm);
        } while (auto && !d.done);
        const r = d.log[d.log.length - 1], myMv = R === 'a' ? r.mA : r.mD, foeMv = R === 'a' ? r.mD : r.mA;
        const hitMe = R === 'a' ? r.dmgA : r.dmgD, hitFoe = R === 'a' ? r.dmgD : r.dmgA, big = Math.max(hitMe, hitFoe) >= 25;
        const iWon = r.won === R, verdict = !r.won ? t('sgRoundTie') : iWon ? t('sgRoundWon') : t('sgRoundLost');
        let msg = `${esc(F('sgMoves', { a: t(MOVES[myMv]), d: t(MOVES[foeMv]) }))}${r.feint ? ` <b class="sgFeint">${esc(t('sgFeint'))}</b>` : ''}<br><b>${esc(verdict)}</b>`;
        const hits = [r.dmgA && F('sgHit', { g: gName(d.a), n: r.dmgA }), r.dmgD && F('sgHit', { g: gName(d.d), n: r.dmgD })].filter(Boolean).join(' · ');
        if (hits) msg += ` · ${esc(hits)}`;
        if (d.done) msg += `<br><b>${esc(d.win ? F('sgDuelWin', { g: gName(d.win === 'a' ? d.a : d.d) }) : t('sgDuelDraw'))}</b>`;
        if (hitMe || hitFoe) { sfx.punch(big ? 1.2 : 0.8); if (big) sfx.clash(0.6); } else sfx.clash(0.4);
        if (d.done) setTimeout(() => (d.win ? sfx.fanfare(d.win === R) : sfx.drum(1)), 250);
        if ((myMv === 'skill' || foeMv === 'skill') && (hitMe || hitFoe)) sfx.sparkle();
        paint(msg, hitMe, hitFoe, big, { my: myMv, foe: foeMv, won: r.won });
      };
      L.addEventListener('click', h);
    });
  }
  async gameOver() {
    const st = this.s, win = st.over === 'win';
    await this.layer(`<h2 class="sgCenter sgBigName">${t(win ? 'sgWin' : 'sgLose')}</h2><p class="sgCenter">${esc(F(win ? 'sgWinS' : 'sgLoseS', { n: st.turn }))}</p><button class="sgBig" data-ok="1">${t('sgAgain')}</button>`);
    this.newGame(false);
  }
  lastDiff() { let d = null; try { d = localStorage.getItem('p905sgdiff'); } catch (e) { /* ignore */ } return E.DIFFS.includes(d) ? d : CFG.sg.diffDefault; }
  async newGame(confirmFirst = true) {
    if (confirmFirst && !window.confirm(t('sgNewQ'))) return;
    // v1.0 (D-87): all eras (the default) or the Three Kingdoms only
    const r = await this.layer(`<h2>${t('sgModeQ')}</h2><button class="sgBig" data-ok="mix">${t('sgModeMix')}<small>${t('sgModeMixS')}</small></button>
      <button class="sgBig alt" data-ok="sanguo">${t('sgModeSg')}<small>${t('sgModeSgS')}</small></button>`);
    this.nextRoster = r === 'sanguo' ? 'sanguo' : 'mix';
    // v1.2 (D-103): how hard the computer lords are
    const cur = this.lastDiff();
    const d = await this.layer(`<h2>${t('sgDiffQ')}</h2>${E.DIFFS.map((x) => `<button class="sgBig${x === cur ? '' : ' alt'}" data-ok="${x}">${t('sgDiff_' + x)}<small>${t('sgDiffS_' + x)}</small></button>`).join('')}`);
    this.nextDiff = E.DIFFS.includes(d) ? d : cur;
    try { localStorage.setItem('p905sgdiff', this.nextDiff); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(SAVE); } catch (e) { /* ignore */ }
    this.open(this.w, this.W, this.H);
  }
  async menu() {
    if (this.busy) return;
    const r = await this.layer(`<h2>${t('sgMenu')}<button class="sgX" data-ok="x">✕</button></h2>
      <button class="sgBig" data-ok="back">${t('sgBack')}</button><button class="sgBig alt" data-ok="help">${t('sgHelp')}</button><button class="sgBig alt" data-ok="tut">${t('sgTutMenu')}</button><button class="sgBig alt" data-ok="new">${t('sgNew')}<small>${esc(F('sgDiffNow', { d: t('sgDiff_' + (this.s.diff || CFG.sg.diffDefault)) }))}</small></button><button class="sgBig alt" data-ok="music">${t(this.music ? 'sgMusicOn' : 'sgMusicOff')}</button>`);
    if (r === 'back') { this.save(); sfx.bgm(false); this.onClose(); }
    else if (r === 'music') { this.music = !this.music; sfx.bgm(this.music); this.menu(); }
    else if (r === 'help') this.layer(`<h2>${t('sgHelp')}<button class="sgX" data-ok="1">✕</button></h2><p class="sgHelp">${esc(t('sgHelpText') + '\n\n' + t('sgHelpMore') + '\n\n' + t('sgHelpV12'))}</p>`);
    else if (r === 'tut') this.tutorial(true);
    else if (r === 'new') this.newGame(true);
  }
}

// ---------------------------------------------------------------- canvas bits
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), ch = (v) => Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
function badge(c, x, y, bg, txt, fg = '#fff', r = 10) {
  c.fillStyle = bg; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke();
  c.fillStyle = fg; c.font = `900 ${Math.round(r * 1.2)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y + 0.5);
}
function arrow(c, ax, ay, bx, by, col, t) {
  const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
  const sx = ax + ux * 26, sy = ay + uy * 26, ex = bx - ux * 34, ey = by - uy * 34;
  c.strokeStyle = col; c.lineWidth = 5; c.setLineDash([12, 8]); c.lineDashOffset = -t * 40;
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
  c.fillStyle = col; c.beginPath(); c.moveTo(ex + ux * 12, ey + uy * 12); c.lineTo(ex - uy * 9, ey + ux * 9); c.lineTo(ex + uy * 9, ey - ux * 9); c.closePath(); c.fill();
}
function pill(c, x, y, bg, txt) {
  c.font = '900 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(txt).width + 10;
  c.fillStyle = bg; c.strokeStyle = '#2b211a'; c.lineWidth = 1.5; rr(c, x - w / 2, y - 8, w, 16, 8); c.fill(); c.stroke();
  c.fillStyle = '#2b211a'; c.fillText(txt, x, y + 0.5);
}
// a pass: two stone towers and a gatehouse with a roof in the owner's colour; the big one has a banner
function gate(c, x, y, col, big, ts = 1) {
  const k = (big ? 1.2 : 0.95) * ts;
  c.save(); c.translate(x, y); c.scale(k, k);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0, 9, 32, 9, 0, 0, 7); c.fill();
  const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fill(); };
  poly([[-30, 8], [30, 8], [30, -10], [-30, -10]], '#9c8a6c');                       // wall
  for (let i = -30; i < 30; i += 8) poly([[i, -10], [i + 5, -10], [i + 5, -14], [i, -14]], '#9c8a6c'); // crenels
  poly([[-30, -10], [-18, -10], [-18, -26], [-30, -26]], '#c9b897');                  // towers
  poly([[18, -10], [30, -10], [30, -26], [18, -26]], '#c9b897');
  poly([[-12, 8], [12, 8], [12, -18], [-12, -18]], '#e8decd');                         // gatehouse
  c.fillStyle = '#4a3220'; c.beginPath(); c.moveTo(-6, 8); c.lineTo(-6, -2); c.arc(0, -2, 6, Math.PI, 0); c.lineTo(6, 8); c.closePath(); c.fill();
  poly([[-17, -18], [17, -18], [11, -27], [-11, -27]], col);
  poly([[-33, -26], [-15, -26], [-19, -32], [-29, -32]], shade(col, 0.82));
  poly([[15, -26], [33, -26], [29, -32], [19, -32]], shade(col, 0.82));
  if (big) {
    c.strokeStyle = '#5a4632'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -27); c.lineTo(0, -50); c.stroke();
    poly([[0, -50], [20, -48], [16, -42], [20, -36], [0, -38]], col);
    c.fillStyle = '#fff'; c.font = "900 11px 'STKaiti','KaiTi','Kaiti SC',serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('关', 10, -43);
  }
  c.restore();
}

// Finger scrolling for the panel and the pop-up cards (v0.9.3): the page blocks native touch scrolling
// (main.js accidental-touch guards) and, when the page is turned for forced landscape, a native scroll
// would also run the wrong way. So a drag is read in game coordinates and scrolls the element itself,
// with a little inertia; a drag never counts as a tap on a button underneath.
function dragScroll(root, sel) {
  let st = null, fling = 0, blockClick = 0;
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(sel);
    cancelAnimationFrame(fling);
    if (!el || e.pointerType === 'mouse' || el.scrollHeight <= el.clientHeight + 1) { st = null; return; }
    st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, top: el.scrollTop, moved: false, v: 0, t: performance.now(), last: 0 };
  });
  root.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const [, dy] = toGameDelta(e.clientX - st.x, e.clientY - st.y), now = performance.now();
    if (!st.moved && Math.abs(dy) > 6) st.moved = true;
    if (!st.moved) return;
    st.el.scrollTop = st.top - dy;
    const dt = Math.max(1, now - st.t);
    st.v = 0.8 * st.v + 0.2 * ((st.last - dy) / dt); st.last = dy; st.t = now;
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (st.moved) {
      blockClick = performance.now() + 350;
      const el = st.el;
      let v = st.v * 16;
      const step = () => { if (Math.abs(v) < 0.5) return; el.scrollTop += v; v *= 0.93; fling = requestAnimationFrame(step); };
      fling = requestAnimationFrame(step);
    }
    st = null;
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  root.addEventListener('click', (e) => { if (performance.now() < blockClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}
