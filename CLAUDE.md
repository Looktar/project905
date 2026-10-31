# CLAUDE.md — Project 905（万锦 Q 版玩具城）

每次开工先读本文件，再看 `docs/PROGRESS.md`。完整立项规格在 `docs/kickoff-prompt.md`（总决策已确认，以它为准；本文件记录与它的差异）。

## 项目一句话
网页 + 手机浏览器都能玩的 3D 卡通“玩具城”开放世界小游戏，地图基于真实万锦（OpenStreetMap）。溜达、打路人、抢车，街上有巡逻警察。轻松休闲，给自己和朋友玩。
试玩：https://looktar.github.io/project905/ （推到 `main` 后 GitHub Pages 自动发布，约 1 分钟）

## 当前状态：v0 可玩原型（由 Claude 项目经理直接完成）
- **无依赖、无构建**：原生 WebGL2 + ES Modules，直接静态托管。原因：v0 制作环境连不上 npm。
- 规格原定 Three.js + Vite + TypeScript + Rapier2D。是否迁移由下一阶段评估（见 docs/DECISIONS.md D-01），**不要在没和总决策确认前做大重构**。

## 目录
```
index.html            页面 + HUD + 样式
js/main.js            启动、主循环、镜头、渲染调度、画质设置、强制横屏入口
js/renderer.js        WebGL2：一个带阴影的实例化着色器 + 阴影贴图 + 招牌着色器
js/geo.js             几何体（圆角盒、球、二十面体、圆柱、圆环、屋顶、星星、路面条带、多边形挤出）
js/world.js           地图加载：分块网格、碰撞网格、路网图(A*)、路名、小地图、地标、停车场
js/game.js            玩法：主角、路人(随机属性/性格)、警察、车流、公交、战斗、追捕、被抓
js/input.js           键盘 + 触屏摇杆/按钮 + 竖屏时整页旋转 90°（强制横屏）
js/hud.js             小地图、路名、血条、气泡、横幅、被抓画面
js/audio.js           WebAudio 合成音效（无音频文件）
js/config.js          所有可调数值
js/i18n.js            中英文案
tools/build_map.py    OSM 原始数据 → maps/markham.json（纯 Python 标准库）
data/raw/markham_osm.json.gz   Overpass 导出的原始数据（已提交，构建不需联网）
maps/markham.json     游戏地图（构建产物，已提交）
docs/                 规格、概念图、进度、决策
```

## 常用命令
```
python3 -m http.server 8905          # 本地运行，打开 http://localhost:8905/?debug=1
python3 tools/build_map.py           # 重新生成地图（改了 build_map.py 后必须跑并提交 maps/markham.json）
```
`?debug=1` 显示帧率、CPU 耗时、draw call、实体数。

## 关键约定
- 坐标：x 向东、z 向南、y 向上，单位米（游戏尺度，真实距离 ×0.4）。“地图北” = -z（路网已转正 15.8°）。
- 镜头方位角固定（config.camera.azimuth），所以招牌是朝向镜头的平面，永远可读。
- 着色：顶点色 alpha 编码材质（0=实例色A，1=实例色B，2=顶点色，小数部分×10=自发光）。
- 静态物体按 160m 分块；房子、树、路灯、停车场车辆是每块一个实例化网格。
- 角色/车辆每帧把部件矩阵写入实例缓冲（game.js `fillBatches`）。

## 工作规则（与规格第 10 节一致）
- 只做当前里程碑；新想法写进 `docs/BACKLOG.md`。
- 数值放 `js/config.js`。
- 小事自己定并记 `docs/DECISIONS.md`；玩法方向/范围/花钱/红线拿不准才问总决策（给选项和推荐）。
- 每完成一项更新 `docs/PROGRESS.md`。
- 合并前：本地跑一遍，桌面 + 手机横屏(844×390) + 手机竖屏(390×844，应自动旋转) 截图看一遍，控制台无报错。
- 代码英文，文档和玩家文字中文 + 英文翻译。

## 内容红线
卡通暴力（不出血、无死亡、倒地冒星星）；真实品牌一律谐音（Tim Hortz、大古广场 Pacifick Mall、Markvile Mall）；游戏内不出现 “GTA”；保留 “© OpenStreetMap contributors”；只用自制或 CC0 素材。
