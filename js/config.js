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
  },
  peds: {
    countDesktop: 30, countMobile: 22,
    spawnMin: 40, spawnMax: 95, despawn: 130,
    walk: 2.2, flee: 7.2, radius: 0.5,
    hp: [30, 120], power: [0.5, 2.0],
    temper: { timid: 0.5, normal: 0.35, angry: 0.13, master: 0.02 },
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
    onewayLane: 2.2,                                   // m right of a one-way carriageway's centre (divided roads)
    passGap: 2.35,                                     // m sideways clearance when pulling out around a parked car
  },
  police: {
    footPatrol: 2, carPatrol: 1, footChase: 4, carChase: 3,
    sight: 25, alert: 60, giveUp: 10,
    runSpeed: 8.0, hp: 150, punchDmg: 9,
    bustFoot: 1.5, bustCar: 2.0, reinforce: 6, respawn: [150, 300], max: 8,
  },
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
  bench: { warmup: 5, measure: 15 },  // seconds, ?bench=1
  post: { band: 0.17, maxR: 6 },      // tilt-shift: sharp half-band (screen fraction), blur radius px @900p
  occlusion: { alpha: 0.32, speed: 9, maxH: 50, sampleY: [0.9, 2.4], silhouette: [0.45, 0.88, 1.0, 0.9] },
};
