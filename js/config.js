// All tunable numbers live here.
export const CFG = {
  camera: {
    fov: 30 * Math.PI / 180,
    azimuth: 0.55,         // radians, camera looks from map south-east
    elevation: 0.86,       // radians (~49 deg)
    distWalk: 70,
    distCarMin: 82,
    distCarMax: 112,        // zooms out with speed
  },
  player: {
    walk: 5.6, run: 9.4, radius: 0.55, hp: 100,
    regenDelay: 5, regenRate: 9,
    punchCooldown: 0.36, punchRange: 1.9, punchArc: 1.2, punchDmg: [12, 19],
    koTime: 3, invuln: 3,
  },
  car: {
    accel: 11, brake: 22, reverse: 6, maxSpeed: 24, maxReverse: 7,
    drag: 0.35, steer: 2.3, grip: 9, driftGrip: 1.6, hp: 100,
    radius: 1.2, length: 4.4,
    wreckExit: 1.2,                                    // s after the player's car dies before they climb out by themselves
  },
  peds: {
    countDesktop: 30, countMobile: 22,
    spawnMin: 40, spawnMax: 95, despawn: 130,
    walk: 2.2, flee: 7.2, radius: 0.5,
    hp: [30, 120], power: [0.5, 2.0],
    temper: { timid: 0.5, normal: 0.35, angry: 0.13, master: 0.02 },
    // South Asian residents (a large part of Markham): share of pedestrians, then outfit chances
    southAsian: 0.35, kurta: 0.45, turban: 0.3, dupatta: 0.5,
    downTime: [8, 12], witness: 15, crossRate: 0.015, crossSpeed: 1.25, crossMaxWait: 12, crossSignalWait: 30, signalReach: 28,
    keepUp: 1.2, catchUp: 1.2, spawnMargin: 0.25, avoidPlayer: 3.2,
  },
  traffic: {
    countDesktop: 16, countMobile: 11, parked: 8,
    spawnMin: 60, spawnMax: 150, despawn: 190,
    speed: [12, 10.5, 8.5, 6.5],
    mix: { sedan: 50, suv: 25, van: 10, taxi: 15 },   // vehicle type weights (traffic + street parking)
    suvSpeed: 0.97, vanSpeed: 0.88, vanAccel: 0.8,     // handling multipliers (top speed / acceleration)
    gap: 6.8, headway: 0.5, followDecel: 6,            // queueing: stop gap (m, centre to centre), + s of speed, braking (m/s^2)
    giveWayGap: 3.2,                                   // minor road: wait this far (m, car centre) outside the main road's carriageway
    onewayLane: 2.2,                                   // m right of a one-way carriageway's centre (divided roads)
    passGap: 2.35,                                     // m sideways clearance when pulling out around a parked car
  },
  police: {
    footPatrol: 1, carPatrol: 1, footChase: 2, carChase: 2,   // owner: fewer police (was 2/1/4/3)
    sight: 25, alert: 60, giveUp: 10,
    runSpeed: 8.0, hp: 150, punchDmg: 9,
    bustFoot: 1.5, bustCar: 2.0, reinforce: 10, respawn: [150, 300], max: 5,
  },
  // game feel (juice): camera trauma added per impact tier, hit-stop seconds; shake = trauma^2
  feel: {
    small: { trauma: 0.12, stop: 0.03 }, medium: { trauma: 0.3, stop: 0.06 }, large: { trauma: 0.6, stop: 0.1 },
    stopScale: 0.08, decay: 1.6, squashTime: 0.22, maxOffset: 1.4,
  },
  // Polyfork models (D-42): on since the owner approved the style sample (2026-11-02); ?pf=0 / ?pf=1 override
  models: { polyfork: true, houses: true, timeoutMs: 6000 }, // houses: Polyfork houses (D-63, default since D-65; ?ph=0 turns them off)
  streetSigns: { y: 4.2, h: 2.2, cornerGap: 3.2, res: 0.45 }, // green street-name signs at signalised intersections
  bus: { count: 2, speed: 9, laneCount: 2, laneSpeed: 0.8 }, // laneCount: Viva buses in Hwy 7 traffic
  minimap: { pxPerM: 0.5, radiusM: 170 },
  world: { viewRadius: 210, fogNear: 150, fogFar: 300 },
  // ---- v0.1 work-package sections (one block each, kept apart to ease merges)
  // input: touch / forced-landscape
  input: { rotateDir: 1 },
  // signals: traffic lights
  signals: {
    green: 9, yellow: 2, allRed: 2,     // s; cycle: E-W green, yellow, all-red, N-S green, yellow, all-red
    clusterRadius: 25,                  // m; junction nodes this close form one intersection (divided roads)
    stopGap: 0.6,                       // m between the crosswalk and the bumper of a car waiting at red
    comfortDecel: 4.5, maxDecel: 9,     // m/s^2; stop for yellow only if a comfortable stop fits, red uses max
    maxWait: 25, impatient: 4,          // s; a car stuck this long ignores lights + AI cars for `impatient` s
    drawRadius: 165,                    // m; lamps are drawn for signals this close to the player
  },
  // props: street furniture + landmarks
  props: {
    hydrantCorner: 6.5,      // m past the junction box for the corner hydrant at arterial junctions
    hydrantFirst: 18,        // m from the junction to the first hydrant along an arterial
    hydrantSpacing: 70,      // m between hydrants on one side of an arterial (collectors: x1.6, one side)
    hydrantGap: 28,          // min distance between any two hydrants
    hydrantOffset: 0.8,      // m outside the curb, on the sidewalk
    manholeSpacing: [60, 115], // m between manhole covers along a road (random in range)
    manholeGap: 24,          // min distance between manhole covers
    manholeResidential: 0.45, // share of residential streets that get manhole covers
  },
  // occlusion: buildings fade when they hide the player
  quality: {
    dpr: { touch: { low: 1, mid: 1.25, high: 1.5 }, desktop: { low: 1, mid: 1.5, high: 2 } },  // spec 6.3: phones <= 1.5
    defaultRes: { touch: 'mid', desktop: 'high' }, shadowMap: { touch: 1024, desktop: 2048 }, autoFps: 26,
  },
  // fire (v0.3, D-69): seconds, metres, heat 0..1 (water takes heat away; 0 = out)
  fire: {
    reach: 2.6, lightCooldown: 1.0, max: 6, startHeat: 0.35, grow: 6,
    carBoom: 9, carLife: 40, wreckBurn: 16, bldLife: 150, groundLife: 25, smokeAfter: 18, forget: 260,
    blast: 7, blastDmg: 25, chain: 5.5, wreckFire: 0.35, burnDps: 14, gawkReach: 32,
    dispatchDelay: 6, maxTrucks: 2, stationReach: 420, hosePower: 0.05, cannonPower: 0.35, cannonRange: 22,
    maxWater: 360, reward: 40,
  },
  // missions (v0.3, D-69): $ and seconds; pace = m/s the timer allows along the road route
  missions: {
    offerReach: 260, slack: 15, deliveryMin: 250, deliveryMax: 750, deliveryPace: 6.5, deliveryBase: 20, deliveryPerM: 0.06,
    taxiWait: 45, taxiMin: 300, taxiMax: 900, taxiPace: 8.5, taxiBase: 15, taxiPerM: 0.08,
    racePace: 14, cpGap: 110, raceBase: 80, raceBonus: 4, landmark: 50, bustFine: 0.1,
  },
  // prank list + golden dim sum (v0.4, D-70): $ rewards, number of buns, min metres between buns
  pranks: { reward: 30, bun: 10, allBonus: 500, buns: 30, bunGap: 140 },
  // 万锦三国志 strategy mode (D-73): one turn = one month; troops, gold, food are plain counts
  sg: {
    startYear: 196, startGold: 600, startFood: 2500, startTroops: 3000, neutralTroops: [700, 1500], neutralRegen: 30, neutralMax: 1500,
    maxTroops: 10000, capBase: 2000, capPerDev: 60, defRegen: 1, defMax: 80, devCost: 50, draftCost: 100,
    // v1.2 (D-102): what an officer achieves grows with the square of his stat: 内政 +2 at 政 25, +7 at 60, +18 at 100;
    // 征兵 180 at 统 25, 570 at 60, 1400 at 100; 搜索 15% at 智 25, 42% at 60, 85% at 100; a low 政治 also pays more for everything
    // v1.5 (D-116): no 内政 order any more; a city grows growBase + growMax x (政/100)^2 a month under its best-政治
    // officer (政 25: +0.5, 60: +1.4, 100: +3.3), growBase x growAlone with nobody there; each building adds bldDevUp
    growBase: 0.3, growMax: 3, growAlone: 0.5, bldDevUp: 5,
    draftBase: 100, draftMax: 1300, effExp: 2, searchMax: 0.8, searchExp: 1.5, fortMax: 16, costMin: 0.6, costMax: 1.4, costPerPol: 1 / 125,
    // v1.2 (D-103): the computer lords are harder: three levels, 困难 by default
    // per game (s.diff, picked when a game starts): grace = months before the computer may attack you, attack = the
    // power ratio it wants before marching, gold / food / draft = how much better than you it runs its lands
    diffDefault: 'hard',
    diff: {
      normal: { grace: 6, attack: 1.25, gold: 1, food: 1, draft: 1, start: 1, coalition: 6 },   // as it was up to v1.1
      hard: { grace: 4, attack: 1.1, gold: 1.3, food: 1.2, draft: 1.3, start: 1.25, coalition: 5 },
      hell: { grace: 3, attack: 1.0, gold: 1.6, food: 1.4, draft: 1.6, start: 1.5, coalition: 4 },
    },
    goldBase: 20, goldPerDev: 1.4, foodBase: 30, foodPerDev: 2.2, foodPerTroop: 1 / 40, hungerLoss: 0.05, cutLoss: 0.08,
    searchBase: 0.05, treasure: [0.25, 80, 150], marchFrac: 0.8,
    duelChance: 0.5, duelRival: 0.85, duelBig: 0.15, duelHit: 20, duelTie: 7, duelRounds: 5, duelLoss: 0.18, duelWinAtk: 0.1, duelCapture: 0.25,
    rounds: 30, roundLoss: 0.1, siegeDef: 15, defDiv: 150, neutralStat: 45,
    flee: 0.6, recruit: 0.4, recruitBond: 0.25, recruitLord: -0.3,
    aiSafe: 2500, coalitionAt: 6, aiBoldGold: [40000, 0.35], aiBoldLast: 0.2,
    // v0.8 (D-74): one order per officer a month; passes (real parks, D-75); real terrain
    minMarch: 100, fortCost: 60, fortBase: 2,
    passTroops: [1400, 2000], passBigTroops: 2600, passDef: 80, passBigDef: 100, passDefMax: 120, passDefRegen: 2, passCap: 6000, passMul: 1.15,
    hillPerM: 0.012, hillMax: 0.24, riverPen: 0.15, valleyFood: 0.4,
    // v0.8.1 (D-75): seasons, stratagems (计略) and random events
    snowPen: 0.1, harvest: 3, plotCost: 80, plotBase: 0.45, plotInt: 1 / 70, plotMax: 0.92, rumorBase: 0.05, rumorPerInt: 1 / 1000, fireBase: 8, firePerInt: 1 / 6,
    eventChance: 0.55, cnyGold: 40,
    // v0.8.2 (D-76): 驿站 relay roads (gas stations) and 补给站 supply depots (malls)
    stationAtk: 0.1, depotFood: 0.3,
    // v0.9 (D-77): random boards
    cityCount: 12, siteSpacing: 500, passCount: 5, passClear: 230,
    rosterSize: 32, rosterBonds: 3, rosterUR: 4, // v1.0 (D-87): officers per game, bonds dealt complete, UR at most
    // v0.9.3: armies on the road: game metres a month, and how much quicker a 驿站 road is
    marchSpeed: 650, relaySpeed: 1.6, maxMarch: 4, // months: the farthest an order may send an army (v0.9.8)
    // duel damage follows (武力 ratio) ^ duelExp
    duelExp: 2.2, duelMin: 0.35, duelMax: 2.8,
    // duels v0.9.9 (D-86): reading stances. Stamina 80 + 统率/5, 斗志 starts at 统率/2; 必杀 costs 50 斗志
    // and hits x1.8; a block counters x0.75 but still takes 30% of the blow; a 武力 gap of 25+ means one blow finishes it. A cleverer foe
    // feints with 5% + 0.4% per point of 智力 he has over you (at most 40%)
    duelHp: 80, duelHpLead: 0.2, duelSpLead: 0.5, duelSkillCost: 50, duelSkillMul: 1.8, duelCounter: 0.75, duelChip: 0.3,
    duelSpHit: 20, duelSpBlock: 15, duelSpTie: 10, duelKoGap: 25, duelDraw: 8,
    feintBase: 0.05, feintPerInt: 0.004, feintMax: 0.4, duelAiRead: 0.7,
    // v0.9.6 (D-83): an officer leads 统率 x leadTroops troops; battles (no dice) go on to the end: up to
    // `rounds` rounds of a siege / fieldRounds in the field, until a side drops under `rout` of its start
    leadTroops: 60, fieldRounds: 40, rout: 0.25, aiSally: 1.1,
    // v1.4 (D-114): historical counters add up to counterMax to a side's attack; (D-115) buildings, per level:
    // market gold +15%, farm food +15%, barracks troop cap +1000 and drafting +10%, walls max defence +15,
    // academy search +6% and development +10%, beacon defenders +8%. One build costs bldCost (x 政治), level 2 needs
    // 开发 40 and level 3 needs 65. The computer builds with aiBuild odds when it has bldCost + aiBuildSpare gold.
    counterMax: 0.4, bldCost: 250, bldDev: [0, 40, 65], bldMarket: 0.15, bldFarm: 0.15, bldCap: 1000, bldDraft: 0.1, bldWall: 15,
    bldAcadSearch: 0.06, bldAcadDev: 0.2, bldBeacon: 0.08, aiBuild: 0.5, aiBuildSpare: 250,
    // v1.1 (D-97): treasure blind boxes. itemCount hidden per game (at most itemUR of the best); a search that finds
    // no officer turns one up with itemBase + 智力 x itemPerInt (14% at 智力 50, 22% at 100)
    itemCount: 10, itemUR: 2, itemBase: 0.06, itemPerInt: 0.0016,
    // v1.1 (D-98): envoys (停战) and poaching (挖角)
    envoyCost: 150, envoyBase: 0.35, envoyPol: 1 / 160, envoyStrong: 0.25, envoyWeak: 0.15, envoyCoalition: 0.3, envoyMonths: 6,
    poachCost: 120, poachLoyal: 0.8, poachInt: 1 / 200, poachBond: 0.2, poachLosing: 0.1, poachSpurned: 6, aiPoach: 0.2, aiPoachMin: 0.25,
  },
  bench: { warmup: 5, measure: 15 },  // seconds, ?bench=1
  post: { band: 0.17, maxR: 6 },      // tilt-shift: sharp half-band (screen fraction), blur radius px @900p
  occlusion: { alpha: 0.32, speed: 9, maxH: 50, sampleY: [0.9, 2.4], silhouette: [0.45, 0.88, 1.0, 0.9] },
};
