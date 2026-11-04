# Project 905 交接文档（2026-11-04，v0.8 之后）

> 新会话开工时先读这份文档，再读 `CLAUDE.md` 和 `docs/PROGRESS.md`（最新的在最上面）。

## 你的角色
- 你接手 Project 905，担任项目总经理兼主开发。我是总决策（产品负责人），平时多半用手机沟通。
- **全程用中文和我交流**；代码和注释用英文。
- 我已长期授权“全程你说的算”：技术细节和小的设计取舍你自己定，记进 `docs/DECISIONS.md`。只有这几种情况才问我：玩法方向、范围变化、要花钱、拿不准是否碰到内容红线。问的时候直接给选项，并写明你推荐哪个。

## 项目现状
- **是什么**：网页 + 手机浏览器都能玩的 3D 卡通“玩具城”，地图基于真实万锦（OpenStreetMap）。玩家可以溜达、打路人、抢车、放火，街上有警察。另有一个“万锦三国志”策略模式。只给我和朋友玩，不上架、不变现。
- **仓库**：https://github.com/Looktar/project905 （公开）。
- **试玩**：https://looktar.github.io/project905/ 。推到 `main` 后，GitHub Pages 约 1 分钟自动上线。
- **技术**：原生 WebGL2 + ES Modules，零依赖、零构建；npm 只用于开发工具（ESLint、Vitest、Playwright）。不迁移 Three.js（D-08）；没和我确认前不做大重构。
- **已完成的版本**（详见 PROGRESS）：
  - v0.1：基础玩法和地图。我的 iPhone 实测平均 60 fps、draw call 约 74。
  - v0.2：认出万锦（商业招牌、加油站、York Region 商业楼）和 Polyfork 模型（车、路灯、房子）。
  - v0.3：放火和消防车，加上送外卖、出租车、赛车、打卡等任务和钱。
  - v0.4：恶作剧清单，加上 30 个金点心收集品。
  - v0.5：全城大地图、搜索、导航和传送。
  - v0.6：人物换成方块积木风。
  - v0.7（2026-11-03）万锦三国志，见下一节。
  - v0.8（2026-11-04）：三国志改成每位武将每月一个命令，加“委任”；地形用真实海拔和胭脂河。
  - **v0.9（2026-11-04，最新）**：三国志每局随机地图：从 27 个真实地点抽 12 座城，路上的真实公园随机变隘口（D-77）。
  - v0.8.2（2026-11-04）：加油站做驿站（出征 +10%、调动走两段），大商场做补给站（自带粮道），见 D-76。
  - v0.8.1（2026-11-04）：隘口改成 5 个真实公园（Toogood 虎牢关等），407 是普通高速；季节、计略、随机事件。见 D-75。见 D-74 和 `docs/research/SANGUO-ANALYSIS.md`。

## v0.7 万锦三国志：做了什么（D-73）
- **入口**：标题页的“⚔ 万锦三国志”按钮，游戏里从设置面板也能进。三国界面打开时，3D 小镇不画、也没有声音。
- **文件**：
  - `js/sg_data.js`：48 位武将，每人四维固定、各有一个特技；另有 10 组羁绊、6 组宿敌、12 座城和 20 条粮道（真实路名）。
  - `js/sg_engine.js`：规则。纯函数、种子随机，存档后能原样复现。
  - `js/sg_ui.js`：界面，策略地图用的是真实小地图图片。存档在 localStorage 的 `p905sg`。
  - 数值在 `CFG.sg`，测试是 `tests/unit/sg.test.js`；冒烟测试里也有进入三国模式、过一个月这一步。
- **规则**：
  - 你和 3 个电脑君主开局各占 1 座城、各随机抽 2 位武将（盲盒翻牌），其余武将藏在各城里，靠“搜索”找出来。
  - 一回合一个月，每座城每月一个命令：内政、征兵、搜索、调动、出征。同一君主打同一座城的几路兵会合兵。
  - 粮道：连不回本城的城没有收入、每月掉兵、不能出征。
  - 单挑由玩家亲自打：猛攻克必杀，必杀破防守，防守挡猛攻；武力决定伤害。输的一方掉兵，还可能被俘。城破时守将可能逃走或被俘，俘虏会被劝降。
  - 防滚雪球：谁占到 6 座城，其他电脑君主就结盟一起打他。开局前 6 个月电脑不打玩家。占满 12 城胜利。
  - 电脑对电脑模拟 60 局，平均约 21 个月分出胜负。
- **还没做**：音效、新手引导、外交、舌战、武将忠诚和挖角、历史事件、3D 单挑、从策略地图跳到街头。都已写进 BACKLOG。

## 下一步（按优先级）
0. **v0.8.1 之后**：A（季节 + 计略）已做，隘口改成真实公园，加了随机事件（D-75）。剩下 B（宝物盲盒）、C（外交 + 挖角）等总决策再定。
1. **先等我试玩 v0.7/v0.8 的反馈**：手机横屏字和按钮是否够大、出征操作顺不顺、单挑手感、一局多长、难度。按反馈开修复 PR。
2. **三国志打磨**（我已授权你自己定细节）：
   - 用 WebAudio 合成音效（单挑、攻城、开盲盒），三国界面里取消静音；
   - 第一局的新手提示（教下命令、出征、搜索）；
   - 根据我的反馈调平衡（`CFG.sg`）。
3. **3D 单挑（大功能，先做样板给我看）**：两位武将在真实地标前对打，比如大古广场门口。
   - 武将模型走 **Tripo 建模 + Blender 修改**流程，见“Tripo 流程”一节；
   - 也可以先用现有方块积木人加盔甲、武器的代码模型做样板，我选定风格后再批量做。
   - 按 `docs/ART-BIBLE.md` 第 7 节“先做一个样板给总决策确认”。
4. **之前挂着的事**：
   - 扩图到世嘉堡和北约克：方案在 `docs/research/EXPANSION-TORONTO.md`，等我选方案；
   - 停车场静态车换 Polyfork 模型（要 iPhone 测速）；
   - `SIM_SEED=23` 时“路人绕过主角”测试会卡住（旧问题）；
   - 支路口等着拐出去的车，车头会伸进路口。

## 工作方式（长期授权）
- **做完直接合并上线，不要把合并留给我**：
  1. 开分支，开 PR。PR 描述用中文、要短，写清做了什么、试玩链接、要我重点试什么、已知问题。
  2. CI 全绿后自己合并（squash）。
  3. 合并后把开发分支重置到最新的 `main` 并推送。
- **合并前**：
  - `npm ci`（第一次）后跑 `npm run lint && npm test && npm run smoke`。冒烟测试的截图要亲眼看。
  - 改了 `js/` 或 `maps/` 要跑 `npm run stamp`。
  - 改了 `tools/build_map.py` 要跑 `npm run map`，并确认 `npm run check:map` 通过。
- **其他规则**：
  - 只做当前任务；新想法写进 BACKLOG。数值放 `js/config.js`，玩家能看到的文字都要有中英文。
  - 已知但还没修的 bug 先写成 `it.fails` 测试。打击反馈统一走 `game.feedback(tier, who)`。
  - 每完成一项更新 PROGRESS。截图放进 `docs/screenshots/vX/`。
- **内容红线**：
  - 卡通暴力：不出血、没有死亡、倒地冒星星；
  - 真实品牌一律用谐音；游戏内不出现 “GTA”；保留 OSM 署名；
  - 素材只用自制、CC0 或 Polyfork（我已授权），每个外来素材登记在 `CREDITS.md`。

## 云端环境注意（2026-11-03 实测）
- Playwright 浏览器已预装（1.63.0），**不要**运行 `playwright install`；从仓库目录里跑脚本才能 import playwright。
- `polyfork.dev` 和 `looktar.github.io` 在沙盒里连不上：
  - 本地冒烟测试会报一堆 `ERR_TUNNEL_CONNECTION_FAILED`，桌面端可能在大地图那一步超时；
  - 这是网络限制，以 GitHub 上的 CI 结果为准。需要访问时，让我在 claude.ai 设置里加白名单。
- `gh` 的 GraphQL 被拦：`gh pr create`、`gh pr merge` 用不了。改用 REST：
  - 开 PR：`gh api repos/Looktar/project905/pulls -f title=... -f head=... -f base=main -F body=@文件`
  - 合并：`gh api -X PUT repos/Looktar/project905/pulls/<n>/merge -f merge_method=squash`
  - 查 CI：`gh api repos/Looktar/project905/commits/<sha>/check-runs`
  - 查部署：`gh api "repos/Looktar/project905/actions/runs?per_page=5"`
- 不要用 `pkill -f "http.server ..."`：它会把自己所在的 shell 一起杀掉。冒烟测试自己会起服务器。
- 子代理的 worktree 放在 `.claude/worktrees/`，不要提交进仓库。

## Tripo 建模 + Blender 流程（以前在我的 Windows 电脑上跑通过）
- 这套流程是我用 ChatGPT/Codex 给另一个 Unity 钓鱼游戏（FishGameV2Unity）跑通的，记录在我电脑的 `文档\Codex\2026-10-28\` 里：
  - `V6_Tripo_Source_Assets_Report_20261028.md`
  - `tripo-commercial-terms-basis.md`
  - `work\tripo-blender-20261028\`（Tripo3d Blender Bridge 插件）
- 当时的做法：在 Tripo 网页用参考图生成 3D（图生 3D、四视图），下载 GLB 原件，用 Blender 修改。
- 当时还剩 1,890 积分。**用积分前先问我**（花钱）。
- 用到 Project 905 要注意：
  - Tripo 原件约 10 万面、带 4096 贴图，太重。必须在 Blender 里减面到几千面以内，并烘焙成顶点色（`js/glb.js` 只读顶点色），再按 ART-BIBLE 第 7 节入库；
  - 授权依据记进 `CREDITS.md`；
  - 风格要贴近方块积木人和低多边形玩具城。
- 在我电脑上操作要通过 Claude 桌面应用连接我的电脑（远程设备工具）。可能用到的文件夹：`文档\Codex`、`文档\project905`（后者只有立项提示词和概念图，代码以 GitHub 为准）。

## 先读这些
`CLAUDE.md` → `docs/PROGRESS.md` → `docs/DECISIONS.md`（D-01 到 D-73）→ `docs/ART-BIBLE.md` → `docs/BACKLOG.md` → `docs/RECOGNITION-TOP50.md` → `docs/kickoff-prompt.md`（完整立项规格）
