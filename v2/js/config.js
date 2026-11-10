// Project 905 v2 (rewrite) - every tunable number lives here.
export const CFG = {
  camera: { fov: 30, azimuth: 0.55, elevation: 0.86, distWalk: 70, distCarMin: 80, distCarMax: 110, lag: 6 },
  player: {
    walk: 5.6, run: 9.6, radius: 0.55, hp: 100, regenDelay: 5, regenRate: 9,
    punchCooldown: 0.34, punchRange: 2.1, punchArc: 1.25, punchDmg: [12, 19], koTime: 3, invuln: 3,
  },
  car: {
    accel: 12, brake: 24, reverse: 7, maxSpeed: 25, maxReverse: 7, drag: 0.32, steer: 2.4,
    grip: 9, driftGrip: 1.5, hp: 100, radius: 1.45, enterDist: 3.4, wreckExit: 1.2,
  },
  peds: {
    countDesktop: 30, countMobile: 22, spawnMin: 58, spawnMax: 100, despawn: 135,
    walk: 2.2, flee: 7.2, radius: 0.48, hp: [30, 120], power: [0.5, 2.0],
    temper: { timid: 0.5, normal: 0.35, angry: 0.13, master: 0.02 },
    southAsian: 0.35, downTime: [8, 12], witness: 15, crossRate: 0.012, sideOff: 1.5,
  },
  traffic: {
    countDesktop: 16, countMobile: 11, parked: 6, spawnMin: 70, spawnMax: 150, despawn: 190,
    speed: [12, 10.5, 8.5, 6.5], mix: { sedan: 50, suv: 25, van: 10, taxi: 15 },
    gap: 7, headway: 0.9, decel: 7, accel: 4.5, turnSpeed: 5, stuck: 12,
  },
  police: {
    footPatrol: 1, carPatrol: 1, max: 5, sight: 25, chaseSight: 45, alert: 60, giveUp: 10,
    run: 8.0, hp: 150, punchDmg: 9, bustFoot: 1.5, bustCar: 2.0, reinforce: 10, respawn: [150, 300],
  },
  signals: { green: 9, yellow: 2, allRed: 2, cluster: 25 },
  feel: {
    small: { trauma: 0.14, stop: 0.03 }, medium: { trauma: 0.32, stop: 0.06 }, large: { trauma: 0.62, stop: 0.1 },
    decay: 1.6, maxOffset: 1.5,
  },
  world: { chunk: 128, loadRadius: 150, dropRadius: 260 },
  minimap: { pxPerM: 0.3, radiusM: 170 },
};

// Palette (docs/ART-BIBLE.md section 4)
export const COL = {
  grass: '#9fd067', park: '#b3db6f', road: '#5b6782', roadMinor: '#5b6782', side: '#dde1e8', sideAlt: '#cfd5df',
  lot: '#cdd2dc', water: '#5fb3e6', bus: '#b4625a', mark: '#f4f6fb', yellow: '#ffcf3f', sky: '#a9c4e8',
  rail: '#8b7d6b', overpass: '#b9bfcb', trunk: '#8a5a3c', leaf: ['#56b657', '#6cc45a', '#49a856', '#7fcf63'],
  cop: '#1e3a8a', glass: '#7fb4d9',
  car: ['#ff6b4a', '#3fa7ff', '#56c26b', '#ffb020', '#b06bff', '#ff5d8f', '#22c1c3', '#f4f6fb', '#8a96ad', '#e04848'],
  skin: ['#f6d2b0', '#eec39a', '#d9a577', '#b97b4f', '#8a5a3a', '#5e3b26'],
  skinSA: ['#c98d5c', '#b07845', '#96623a', '#7a4d2c'],
  hair: ['#2b2320', '#3c2b1f', '#5a3a22', '#7a5230', '#c9a15a', '#d8d8d8', '#111418'],
  shirt: ['#ff6b4a', '#3fa7ff', '#56c26b', '#ffb020', '#b06bff', '#ff5d8f', '#22c1c3', '#f4f6fb', '#f2c94c', '#6d7bd6'],
  pants: ['#2d3a55', '#3b4a6b', '#5b4636', '#3a5a4a', '#6b7280', '#1f2937'],
};
