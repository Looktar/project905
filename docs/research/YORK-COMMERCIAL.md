# 商业建筑对照 York Region 数据 · Commercial buildings vs York Region（2026-11-02）

总决策问：能不能对照 York Region 的数据，对比一下商业的部分？

## 怎么比
- 数据：York Region Open Data「Building Footprint」，按地图范围分页下载 94,160 个轮廓，去掉标记为已拆除（Deleted）的 2,680 个；落在游戏地图里的 33,023 个。原始下载只在本机 `test-results/york/`，没有提交，也没有进游戏。
- York 的轮廓没有“用途”字段，所以这样认定“商业建筑”：在 OSM 的商业 / 零售 / 工业用地里，或者楼里有 OSM 的店铺、餐馆、咖啡店、加油站、银行，或者面积超过 1000 m² 且不在住宅用地上。小于 40 m² 的棚子不算。结果：**1,327 栋，共 3.76 km²**（真实面积）。
- 每栋 York 楼在游戏里被游戏建筑盖住多少：≥60% 算“有”，20–60% 算“部分”，<20% 算“没有”。
- 注意：York 数据只覆盖 York Region。Steeles 以南（多伦多）没有数据，那里的游戏建筑无法对照。

## 结果
| | 修之前 | 修之后（D-67） |
|---|---|---|
| 游戏里有 | 1,179 栋，3.57 km²（95%） | 1,184 栋，3.61 km²（96%） |
| 只有一部分 | 40 栋，0.035 km² | 41 栋，0.050 km² |
| 游戏里没有 | 108 栋，0.153 km² | 102 栋，0.101 km² |

- **餐馆、咖啡店、商场基本都在**：楼里有店铺的 York 商业楼共 270 栋，游戏里没有的只有 17 栋，其中大多是加油站的小便利店。游戏里的加油站是按品牌生成的“便利店 + 雨棚”，放在路口一侧，所以和真实小楼的位置对不上。
- **缺的面积主要是写字楼和厂房**：Esna Park（约 2.6 万 m²）、Steelcase、Valleywood 商务园、14th Ave 一带。这些楼 OSM 里没有画，所以游戏里也没有。
- **修好的 bug**：只要建筑有一个角超出地图边线，整栋就被丢掉。King Square（王府井）商场压在北边线上，被丢掉后游戏只放了一个替代用的小方块；Steelcase 西边的大楼少了一半。现在改成按地图边线裁掉超出的部分，保留里面的部分；OSM 建筑 2184 → 2207 栋。
- **游戏有、York 没有的楼（137 栋）**：大多是 Steeles 以南（多伦多，York 没数据）、Downtown Markham 新塔楼（游戏自己生成的）、加油站雨棚、Unionville 老街生成的店面，以及几家车行（OSM 只有点，游戏在附近放了楼）。没有发现明显不该存在的商业楼。

## 图
- `docs/screenshots/v0.2/map-accuracy/york-commercial-overview.png`：全图。蓝 = 游戏建筑；绿框 = York 商业楼，游戏里有；橙框 = 只有一部分；红 = 游戏里没有；紫框 = 游戏有、York 没有。
- `york-kingsquare.png`：King Square 修好后。
- `york-steeles-woodbine.png`：Steelcase / Woodbine 工业区。

## 补上之后（D-68，总决策同意“补上”）
- `tools/fetch_york.py` 下载 ≥300 m² 的 York 轮廓（5,218 个，`data/raw/york_footprints.json.gz`，784 KB），`build_map.py` 只补 OSM 没有、又是商业 / 工业的楼：新增 44 栋（Esna Park、Steelcase、Valleywood、14th Ave 等）。
- 对照结果：游戏里有 1,213 栋，3.70 km²（**98%**）；只有一部分 40 栋，0.047 km²；游戏里没有 74 栋，只剩 **0.012 km²**，基本都是 300 m² 以下的小楼（加油站便利店、Unionville 老街店面，游戏里另有生成的版本）。
- 地图文件 1804 → 1817 KB。
