# CLAUDE.md — Project 905（万锦 Q 版玩具城）

每次开工先读本文件，再看 `docs/PROGRESS.md`。完整立项规格在 `docs/kickoff-prompt.md`（总决策已确认，以它为准；本文件记录与它的差异）。

## 项目一句话
网页 + 手机浏览器都能玩的 3D 卡通“玩具城”开放世界小游戏，地图基于真实万锦（OpenStreetMap）。溜达、打路人、抢车，街上有巡逻警察。轻松休闲，给自己和朋友玩。
试玩：https://looktar.github.io/project905/ （推到 `main` 后 GitHub Pages 自动发布，约 1 分钟）

## 当前状态：v0.1 打磨（2026-11-01）；群英传 v2.0（2026-11-13）
- **游戏本身零依赖、零构建**：原生 WebGL2 + ES Modules，直接静态托管。
- **D-08 已定**：不迁移到规格原定的 Three.js + Vite + TypeScript + Rapier2D；npm 只用于开发工具（ESLint、Vitest、Playwright）。**不要在没和总决策确认前做大重构。**
- 进度和已知问题见 `docs/PROGRESS.md`；以后的想法在 `docs/BACKLOG.md`。

## 目录
```
index.html            页面 + HUD + 样式
js/main.js            启动、主循环、镜头、渲染调度、设置/制作人员面板、自动画质、基准测试
js/renderer.js        WebGL2：带阴影的实例化着色器 + 阴影贴图 + 招牌 + 遮挡淡出/X 光轮廓 + 微缩景深后处理
js/geo.js             几何体（圆角盒、球、二十面体、圆柱、圆环、屋顶、星星、路面条带、多边形挤出）
js/world.js           地图加载：分块网格、碰撞网格、路网图(A*)、路名、小地图、地标、停车场、遮挡查询
js/signals.js         红绿灯：从路网找信号路口、相位时钟、灯柱/停止线几何
js/props.js           地标与街道道具：老街店面、凉亭、塔楼、影城、Viva 车站、消防栓、井盖
js/game.js            玩法：主角、路人(随机属性/性格/过马路)、警察、车流(等红灯)、公交、战斗、追捕、被抓
js/fire.js            v0.3 放火：车 / 楼 / 地面着火、爆炸、消防车和消防员、水炮（D-69）
js/missions.js        v0.3 任务：送外卖、出租车、赛车、地标打卡、钱（D-69）
js/pranks.js          v0.4 万锦恶作剧清单（game.ev 事件）+ 30 个金点心收集品（D-70）
js/nav.js             v0.5 地点索引、容错搜索、GPS 导航路线、传送（D-71）
js/bigmap.js          v0.5 全城大地图界面：点小地图或按 M，拖动 / 缩放 / 搜索 / 导航 / 传送
js/sg_data.js         v0.7 万锦三国志（v1.0 改名万锦群英传）数据：118 位历代名将（每局抽 32 位，D-87）、特技、羁绊、宿敌、12 座城和粮道（D-73）、v1.4 历史克制 / 天时 / 城镇建筑（D-114、D-115）
js/sg_engine.js       v0.7 万锦三国志规则：回合、每位武将一个命令（v0.8）、公园隘口、地形、季节、计略、随机事件（v0.8.1）、驿站和补给站（v0.8.2）、粮道、战斗、单挑、俘虏、电脑君主、反联盟、宝物、停战、挖角（v1.1）、克制和建筑（v1.4）、城市自己发展（v1.5，没有内政命令）、羁绊追踪 / 军饷 / 电脑募兵（v1.6）、军粮 / 米市 / 烧粮（v1.7）、军师建议和下月预测（v1.9）、战法（v2.0）（纯函数，种子随机）
js/sg_sites.js        v0.9 随机地图的地点池：27 个真实地点、35 个公园、每两城之间的真实路名 / 渡河 / 驿站 / 公园（tools/build_sg_sites.py 生成，D-77）
js/sg_elev.js         v0.8 真实海拔网格（tools/fetch_elev.py 生成，Copernicus DEM）：三国地形、关隘、仰攻（D-74）
js/sg_portrait.js     v1.3 武将 Q 版头像（代码画，名将手工定制，其余按数据自动搭配，D-109）
js/sg_paper.js        v1.3 古地图底图（宣纸、水墨山、等高线、河流、淡墨街道、印章）和木纹桌面，打开时烘焙一次（D-110）
js/sg_bios.js         v1.2 118 位武将的文字介绍，中英文（D-105）
js/sg_art.js          v1.1 策略地图上的城池图标：每座城画成自己的地标（D-99）
js/sg_map.js          v1.5 策略地图装饰：势力版图（水彩）、毛笔弯道和沿路取点、行军小兵、空地小画、小船 / 云影 / 飞鸟（D-117 到 D-119）
js/sg_table.js        v1.8 策略地图 3D 立体沙盘（WebGL2：海拔地形、贴图、光照、木桌；投影 / 反投影给 sg_ui 用，D-124）
js/sg_ui.js           v0.7 万锦三国志界面：策略地图、城池面板、急报、盲盒翻牌、单挑；存档在 localStorage p905sg
js/input.js           键盘 + 触屏摇杆/按钮 + 竖屏时整页旋转 90°（强制横屏）
js/orient.js          强制横屏的坐标换算和安全区映射（纯函数，有单元测试）
js/glb.js             最小 GLB 加载器：模型转成顶点色三角形，交给 MeshBuilder.addTriangles 烘焙
js/models.js          Polyfork 模型清单：运行时从 polyfork.dev CDN 加载（?pf=1），缩放、调色、车漆改随机色；失败退回代码模型
js/hud.js             小地图、路名、血条、气泡、横幅、被抓画面
js/audio.js           WebAudio 合成音效 + 三国志背景音乐（无音频文件）
js/config.js          所有可调数值
js/i18n.js            中英文案
tools/build_sg_sites.py  maps/markham.json + OSM 原始数据 → js/sg_sites.js（改了地图后重跑并提交）
tools/fetch_elev.py   抓真实海拔 → js/sg_elev.js（需要联网，结果已提交）
tools/fetch_osm.py    从 Overpass 抓原始数据（两段查询：地图 + 店铺，自动重试多个镜像）→ data/raw/
tools/build_map.py    OSM 原始数据 → maps/markham.json（纯 Python 标准库）
tools/concept_chars.mjs  人物风格概念图（2D SVG → PNG，docs/concept/characters/）
tools/char_closeup.mjs   人物近景截图（美术检查，要先 npm run serve）
data/raw/markham_osm.json.gz   Overpass 导出的原始数据（已提交，构建不需联网）
maps/markham.json     游戏地图（构建产物，已提交）
docs/                 规格、概念图、进度、决策；docs/ART-BIBLE.md 美术规范和性能预算；docs/PLAYTEST.md 试玩反馈表；docs/screenshots/ 截图
assets/               外来模型（assets/models/）和素材清单 assets/asset-manifest.json；来源写进 CREDITS.md
.claude/skills/       项目技能：game-feel、performance-optimization、create-game-assets（Apache-2.0，示例是 Godot/Unity，要换成我们的写法）
tests/unit/           Vitest：坐标换算、数学、地图数据、无头玩法模拟（tests/helpers/headless.js）
tests/e2e/smoke.mjs   Playwright 冒烟：桌面 / 手机横屏 / 手机竖屏，截图到 test-results/smoke/
.github/workflows/ci.yml   PR 和 main 上自动跑 lint、测试、地图可复现、冒烟（不部署）
```

## 常用命令
```
npm ci                               # 装开发工具（只第一次）
npm run serve                        # 本地运行，打开 http://localhost:8905/?debug=1
npm run lint && npm test             # ESLint + 单元测试（约 10 秒；SIM_SEED=7 npm test 换随机种子）
npm run smoke                        # 三种画面的冒烟测试 + 截图（约 1 分钟）
npm run map:fetch                    # 重新抓 OSM 原始数据（需要联网；之后再跑 npm run map）
npm run map                          # 重新生成地图（改了 build_map.py 后必须跑并提交 maps/markham.json）
npm run check:map                    # 确认提交的地图和 build_map.py 一致
npm run stamp                        # 改了 js/ 或 maps/ 后更新 index.html 的版本号（D-61，不更新单元测试会失败）
```
- 网址参数：`?debug=1` 显示帧率、CPU、draw call、实体数；`?bench=1` 在出生点跑 20 秒基准测试；`?noauto=1` 关掉自动降画质（截图、测试用）。
- 云端环境里 Playwright 浏览器已预装（1.63.0），**不要**运行 `playwright install`。
- 群英传 3D 沙盘在软件渲染（无头浏览器）里默认关闭，截图要看 3D 时加 `?sg3d=1`。

## 关键约定
- 坐标：x 向东、z 向南、y 向上，单位米（游戏尺度，真实距离 ×0.4）。“地图北” = -z（路网已转正约 15.5°）。
- 地图范围：Woodbine 以西约 600 米 ~ Markham Rd，Steeles ~ 16th Ave 以北约 250 米（游戏里约 3.5 × 2.6 km）。Windows 上没有 `python3` 时用 `python tools/build_map.py`。
- 镜头方位角固定（config.camera.azimuth），所以招牌是朝向镜头的平面，永远可读。
- 着色：顶点色 alpha 编码材质（0=实例色A，1=实例色B，2=顶点色，小数部分×10=自发光）。
- 静态物体按 160m 分块；房子、树、路灯、停车场车辆是每块一个实例化网格。
- 角色/车辆每帧把部件矩阵写入实例缓冲（game.js `fillBatches`）。主角（或主角开的车）永远先写进每个批次，`b.pk` 记住它占了前几个实例：X 光轮廓只画这部分。
- 每个区块的实例化网格都放进 `c.inst` 列表（main.js 统一画）；小道具直接烘焙进区块静态网格，不增加 draw call。
- 每栋 OSM 建筑在区块网格里的顶点范围记在 `world.bRange`，遮挡淡出靠它把这栋楼单独画成半透明。
- 已知但还没修的 bug 先写成 `it.fails` 测试（D-15）。
- 群英传的事件对象不要用 `t` 当自己的字段：`ev()` 会把 `t` 写成回合数（v1.1 的挖角事件因此让月末战报崩溃、界面锁死，D-106）。界面里等待卡片 / 动画一律走 `this.ui()`。
- 打击反馈统一走 `game.feedback(tier, who)`（小/中/大三级，见 `CFG.feel`），不要另外直接改 `game.shake`。
- 引入任何外来模型前，先按 `docs/ART-BIBLE.md` 第 7 节先做一个样板给总决策确认。

## 工作规则（与规格第 10 节一致）
- 只做当前里程碑；新想法写进 `docs/BACKLOG.md`。
- 数值放 `js/config.js`。
- 小事自己定并记 `docs/DECISIONS.md`；玩法方向/范围/花钱/红线拿不准才问总决策（给选项和推荐）。
- 每完成一项更新 `docs/PROGRESS.md`。
- 合并前：`npm run lint && npm test && npm run smoke` 全绿。冒烟测试会自动截桌面、手机横屏(844×390)、手机竖屏(390×844，应自动旋转)三张图，并检查控制台无报错；三张截图要亲自看一遍。
- 代码英文，文档和玩家文字中文 + 英文翻译。

## 内容红线
卡通暴力（不出血、无死亡、倒地冒星星）；真实品牌一律谐音（Tim Hortz、大古广场 Pacifick Mall、Markvile Mall）；游戏内不出现 “GTA”；保留 “© OpenStreetMap contributors”。
素材：自制、CC0，或 Polyfork（polyfork.dev）免费模型。Polyfork 由总决策 2026-11-01 授权使用，不受 CC0 限制（D-42）；每个外来素材的来源和许可要登记在 `CREDITS.md`。
