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
    walk: 4.6, run: 8.2, radius: 0.55, hp: 100,
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
    walk: 1.6, flee: 6.4, radius: 0.5,
    hp: [30, 120], power: [0.5, 2.0],
    temper: { timid: 0.5, normal: 0.35, angry: 0.13, master: 0.02 },
    downTime: [8, 12], witness: 15, crossRate: 0.015, crossSpeed: 1.25, crossMaxWait: 12,
  },
  traffic: {
    countDesktop: 16, countMobile: 11, parked: 8,
    spawnMin: 60, spawnMax: 150, despawn: 190,
    speed: [12, 10.5, 8.5, 6.5],
  },
  police: {
    footPatrol: 2, carPatrol: 1, footChase: 4, carChase: 3,
    sight: 25, alert: 60, giveUp: 10,
    runSpeed: 7.0, hp: 150, punchDmg: 9,
    bustFoot: 1.5, bustCar: 2.0, reinforce: 6,
  },
  bus: { count: 2, speed: 9 },
  minimap: { pxPerM: 0.5, radiusM: 170 },
  world: { viewRadius: 210, fogNear: 150, fogFar: 300 },
  // ---- v0.1 work-package sections (one block each, kept apart to ease merges)
  // input: touch / forced-landscape
  input: { rotateDir: 1 },
  // signals: traffic lights
  signals: {},
  // props: street furniture + landmarks
  props: {},
  // occlusion: buildings fade when they hide the player
  quality: {
    dpr: { touch: { low: 1, mid: 1.25, high: 1.5 }, desktop: { low: 1, mid: 1.5, high: 2 } },  // spec 6.3: phones <= 1.5
    defaultRes: { touch: 'mid', desktop: 'high' }, shadowMap: { touch: 1024, desktop: 2048 }, autoFps: 26,
  },
  bench: { warmup: 5, measure: 15 },  // seconds, ?bench=1
  occlusion: { alpha: 0.32, speed: 9, maxH: 50, sampleY: [0.9, 2.4], silhouette: [0.45, 0.88, 1.0, 0.9] },
};
