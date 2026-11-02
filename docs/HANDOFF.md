# Project 905 交接提示词（2026-11-02）

> 在新对话开头粘贴下面整段。

---

你接手 Project 905，担任项目总经理兼主开发。我是总决策（产品负责人），平时多用手机沟通。**全程用中文和我交流**；代码和注释用英文。

## 项目
- 网页 + 手机浏览器都能玩的 3D 卡通“玩具城”开放世界小游戏，地图基于真实万锦（OpenStreetMap）。可以溜达、打路人、抢车，街上有警察。轻松休闲，给我和朋友玩。
- 仓库：https://github.com/Looktar/project905 （公开）。试玩：https://looktar.github.io/project905/ ，推到 `main` 后 GitHub Pages 约 1 分钟自动上线。
- 技术：原生 WebGL2 + ES Modules，游戏本身零依赖、零构建；npm 只用于开发工具（ESLint、Vitest、Playwright）。不迁移 Three.js（D-08），不要在没和我确认前做大重构。

## 开工先读
1. `CLAUDE.md`：目录、命令、约定、工作规则、内容红线。
2. `docs/PROGRESS.md`：最新进度在最上面。
3. `docs/DECISIONS.md`：D-01 到 D-50 的决策记录。
4. `docs/ART-BIBLE.md`：美术规范、外来模型入库标准、性能预算。
5. `docs/RECOGNITION-TOP50.md`：“认出万锦”优先清单。
6. `docs/BACKLOG.md`、`docs/PLAYTEST.md`、`CREDITS.md`。
7. 完整立项规格：`docs/kickoff-prompt.md`。

## 工作方式（我已长期授权）
- **做完直接合并上线，不要把合并留给我**：开 PR（中文、简短，写清做了什么、试玩链接、要我重点试什么、已知问题），本地检查全绿后自己合并；合并后把开发分支重置到最新 `main` 并推送。
- 合并前必须 `npm ci`（第一次）后跑 `npm run lint && npm test && npm run smoke`；改了 `tools/build_map.py` 要跑 `npm run map` 并确认 `npm run check:map` 通过；冒烟测试的三张截图（桌面、手机横屏 844×390、手机竖屏 390×844）要亲眼看。
- 小事自己定，记进 DECISIONS；玩法方向、范围、花钱、红线拿不准才问我（给选项和推荐）。每完成一项更新 PROGRESS。
- 已知但未修的 bug 先写成 `it.fails` 测试。打击反馈统一走 `game.feedback(tier, who)`。外来模型先做样板给我确认再批量替换。
- 云端环境注意：Playwright 浏览器已预装（1.63.0），**不要**运行 `playwright install`；子代理的 worktree 在 `.claude/worktrees/`，不要提交进仓库。

## 内容红线
卡通暴力（不出血、无死亡、倒地冒星星）；真实品牌一律用谐音（Tim Hortz、Pacifick Mall、Petro-Kanada……）；游戏内不出现 “GTA”；保留 “© OpenStreetMap contributors”。素材可以用自制、CC0 和 Polyfork（我已授权），每个外来素材登记在 `CREDITS.md`。

## 当前状态
- v0.1 基本完成。我的 iPhone 实测平均 60 fps、最差 1% 58.8 fps、draw call 74，性能余量充足。
- v0.2（认出万锦 + 模型更精美）进行中，已完成：
  - 加油站、车行街、华人广场、教堂、学校和谐音招牌；
  - 路口绿色路牌、Hwy 7 上的 Viva 公交、左转让行、路人看红绿灯；
  - 约 35% 印度裔路人、警察调少；
  - 打击手感（分级震动、顿帧、被打的人压扁回弹）；
  - GLB 加载器 `js/glb.js` 和 Polyfork 模型模块 `js/models.js`。

## 待办（按优先级）
1. **Polyfork 模型**：样板（轿车 + 行道树）只在网址加 `?pf=1` 时启用，等我确认风格。
   - 我确认后：把 `CFG.models.polyfork` 设为 true，再按美术规范第 7 节扩展到 SUV、面包车、出租车、警车、公交、路灯、消防栓、公交站。候选在 Polyfork 的 nyc-city-kit 和 neighborhood-pathways-kit；人物另外评估。
   - **许可要求**：模型运行时从 polyfork.dev 的 CDN 加载，不能提交进公开仓库（D-50）。
   - 用 `curl https://polyfork.dev/api/assets?q=...` 搜索模型（不需要账号），请求时带一个写明本项目的 User-Agent。
2. **补地图数据、扩大地图**：
   - 现有数据缺几乎所有餐厅；Woodbine 一带（万锦广场、王府井、日本城）和 McCowan 以东（Costco、海底捞）不在地图里。
   - 我选了方案 B：我在电脑上用 overpass-turbo.eu 跑两段查询，导出 `map.json`（道路、水、铁路、绿地、非住宅建筑）和 `places.json`（餐厅、店铺、加油站、商场等）。我会把文件当附件发你，或者传到仓库 `data/raw/`。
   - 两段查询的范围都是 `bbox:43.805,-79.385,43.905,-79.235`，原文见上一个对话；如果你需要，可以按 `tools/build_map.py` 用到的标签重写。
   - 拿到数据后：合并进 `tools/build_map.py`，把地图边界向西扩到 Woodbine 以西、向东扩到 Markham Rd；按 Top 50 清单做商场、餐厅、奶茶店的谐音招牌和小地图标记；补上没品牌的加油站。注意地图 JSON 的大小，以及小地图和出生点不受影响。
   - 如果环境能直接访问 `overpass-api.de`，也可以自己抓（同样两段查询）。
3. 旺角广场（Peachtree Centre）、城市广场（Metro Square）现有数据里就有，可以先做。
4. 小问题：支路口等着拐出的车，车头会伸进路口；部分停车场的多边形不显示。

## 网络
- 上一个环境里：`polyfork.dev` 能访问，`overpass-api.de` 不能访问。
- 新环境要重新测；被拦时，让我去环境设置 → Network access → Allowed domains 里添加。
