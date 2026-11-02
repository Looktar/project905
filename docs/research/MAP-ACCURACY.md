# 地图准确性调研 · Map accuracy research（2026-11-02）

总决策问：怎样提升建筑和道路（地图系统）的准确性？别人怎么做、社区有什么建议和工具？

## 结论（一句话）
**最大的问题不是算法，是数据**：OSM 在我们的地图范围里只有约 4,700 栋建筑，几乎没有住宅；York Region（约克区）政府开放数据有约 **94,000 栋**真实建筑轮廓、约 **104,000 块**地块、门牌点和带车道数的道路，许可证已被 OSM 法律工作组认定兼容（2024 年 4 月）。把它接进 `build_map.py`，住宅区就能按真实位置摆房子。

## 1. 现状的误差从哪来
| 来源 | 现在怎么做 | 误差 |
|---|---|---|
| 商业/公共建筑 | OSM 轮廓，按 0.4 倍摆放，有空地再放大到 1.35 倍（D-64） | 已基本准确 |
| 住宅 | OSM 没有住宅轮廓，沿住宅路每 11.5 米**猜**一栋独立屋 | 位置、数量、类型都不对：真实大量是联排屋（townhouse），一排 6–10 户；有的路边其实没有房子 |
| 道路 | OSM 中心线 + 按等级/车道估宽度；住宅路固定 6 米宽 | 线位准确；宽度是估的，住宅路比按比例算的宽（约 3.4 米 → 6 米），挤占房子位置 |
| 比例 | 地图压缩到 0.4 倍，但人和车是真实大小 | 真实房子按 0.4 倍只有约 4×5 米，比车还小，这是“放真实房子”最大的设计矛盾 |

对照图：`docs/screenshots/v0.2/map-accuracy/york-footprints-vs-game.png`（绿框 = York Region 真实建筑，橙 = 游戏生成的房子，蓝 = 游戏里的 OSM 建筑）。右下角住宅区能看到真实是一排排联排屋，游戏里是稀疏的独立屋。

## 2. 可用的数据源
| 数据 | 内容 | 数量（地图范围） | 许可 | 评价 |
|---|---|---|---|---|
| **York Region Open Data**（[Building Footprint](https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Structures/MapServer/0)） | 按航拍屋顶线描的建筑轮廓，2005/2012/2023–2025 更新 | **94,160 栋**（OSM 约 4,700） | York Region Open Data Licence（仿英国 OGL），OSMF LWG 2024-04 认定与 ODbL 兼容（[讨论](https://community.openstreetmap.org/t/import-footprints-and-maybe-addresses-from-york-region-s-open-data/110002)） | **首选**。ArcGIS REST 可直接按范围查询，每次 2000 条，可分页 |
| York Region [Parcel](https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Planning/MapServer/0) | 地块边界、门牌数、类型 | 104,248 块 | 同上 | 可判断哪里是住宅、地块朝向、一块地几户 |
| York Region [Address Point](https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Location/MapServer/0) | 门牌点 | 未数 | 同上 | 可选：房子正门朝向、门牌号彩蛋 |
| York Region [Roads / Regional Road](https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Transportation/MapServer) | 道路中心线；区级道路带 `NUMLANES` 车道数 | — | 同上 | 补 OSM 缺的车道数，干道宽度更准 |
| Statistics Canada [Open Database of Buildings](https://open.canada.ca/data/en/dataset/40e37a0f-1393-4e91-bd00-334dceb26e34) v3（2025-04） | 全国市政来源的建筑轮廓合集 | 未确认含 York | OGL-Canada | 备选；York 原始数据更新更直接 |
| [Overture Maps](https://docs.overturemaps.org/) buildings | OSM + Esri + Microsoft/Google 机器学习轮廓合并 | 未数 | ODbL | 备选；机器学习轮廓不如政府数据准，有社区反馈称加拿大 ODB 不如 Overture，但 York 是政府测绘数据 |
| City of Markham Open Data | 市自己的目录（许可：Markham Open Data Licence） | — | 宽松，署名可选 | 地块服务（Public_Properties）几乎没有字段，不如 York 的好用 |

## 3. 别人怎么做（工具和做法）
- **[osm2streets](https://github.com/a-b-street/osm2streets)**（A/B Street 团队，Rust，有 JS/Python 绑定）：把 OSM 转成车道级路网，输出每条车道宽度/方向和**路口多边形**，还会合并“狗腿”路口。适合以后改进路口和车道画法；我们零构建，只能在 `tools/` 里离线用（Python 绑定或 Rust 命令行），把结果写进 `markham.json`。API 还不稳定。
- **[OSM2World](https://osm2world.org/)、[Streets GL](https://community.openstreetmap.org/t/streets-gl-a-new-3d-renderer-for-osm/98594)**：OSM 3D 渲染器，路宽用 `width` → `lanes` → 道路等级默认值依次推算，和我们现在的做法一样；有 `area:highway`（路面多边形）时更准，但万锦几乎没人画。
- **学术/游戏的通用做法**：OSM 缺建筑的地方用程序化生成，按“街区 → 地块 → 建筑”切分（例：[3D City Reconstruction from OSM, 2021](https://diglib.eg.org/handle/10.2312/stag20211474)）。我们有了真实地块，就不用猜地块。
- **商业游戏**（如微软飞行模拟）用航拍 + 机器学习生成建筑，成本和数据量远超本项目，不适用。

## 4. 建议方案
**A（推荐）接入 York Region 建筑 + 地块，住宅按真实位置摆**
1. `tools/fetch_york.py`：按地图范围分页下载建筑轮廓和地块（约 20 万个要素），压缩存进 `data/raw/`（和 OSM 原始数据一样提交，构建不需联网）。
2. `build_map.py`：
   - 非住宅建筑：York 轮廓补上 OSM 没有的楼（店铺名、类型仍用 OSM 标签）。
   - 住宅：每块住宅地块 → 判断独立屋 / 半独立 / 联排（看地块宽度和一块地上几栋）→ 在真实位置朝真实方向摆一栋 Polyfork 房子；联排屋一排合成一栋长条房子。房子仍按玩具比例放大，放不下就每两户合一栋，**位置和密度跟真实一致**，不再沿路乱猜。
   - 没有地块房子的地方不再生成房子。
3. `CREDITS.md` 和游戏里的数据署名加一行 York Region。
- 代价：一次性约 1–2 天；地图文件会变大（预估 +0.5–1 MB，压缩后更少），房子数量可能变多，要再跑一次 iPhone 测速。

**B 调整比例（0.4 → 0.6）**：真实房子按比例够大、和车人匹配，但地图变成约 5.3 × 3.9 km，走路开车时间多一倍，数据量和区块数也翻倍。建议先不做，等 A 做完看效果再议。

**C 道路细化（以后）**：York `NUMLANES` 补车道数；osm2streets 生成路口多边形。路网线位已经准，这项收益小于 A。

## 5. 需要总决策确认
York Region 数据是新的外来数据源（规则只写了 OSM + 自制/CC0/Polyfork 素材），许可是 York Region Open Data Licence，需要在制作人员里署名。是否同意使用？
