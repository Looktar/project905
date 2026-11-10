# Project 905 · v2 重制版（万锦玩具城）

试玩：https://looktar.github.io/project905/v2/ 　旧版原样保留在 https://looktar.github.io/project905/

2026-11-10 总决策要求用新模型把项目重新做一遍，选的是“从零重写、旧版保留、先做玩具城核心、技术路线由项目经理定”（D-88 起）。
这个目录是全新写的代码，不引用根目录 `js/` 里的任何文件；只共用地图数据 `maps/markham.json`。

## 这一版有什么
- 真实万锦地图（同一份 OSM 数据）：道路、人行道（地砖）、停车场（车位线）、房子、树、商场、招牌、地标屋顶道具（甜甜圈、奶茶、购物袋、爆米花桶）、红绿灯、407 高架、快速公交道。
- 溜达、跑、出拳；路人有随机血量、力气和性格（胆小 / 普通 / 暴躁 / 隐藏高手），会逃、会还手、会倒地冒星星。
- 抢车：空车直接上，有司机就拽下来；街机手感，手刹漂移，撞多了冒烟熄火。
- 车流会等红灯、跟车、让行人；路人靠人行道走。
- 警察：步行巡逻和警车；只有被警察看见才算犯事；追捕、增援、甩掉（10 秒看不见）、被抓（没有惩罚，150–300 米外重新出现）。
- 手机强制横屏（竖着拿时整页旋转）、触屏摇杆和三个按钮、小地图、路名、气泡、设置、中英文。

## 还没搬过来（旧版有）
放火和消防车、任务和钱、恶作剧清单和金点心、全城大地图 / 搜索 / 导航 / 传送、Viva 公交车、Polyfork 模型、万锦群英传。见 `docs/BACKLOG.md`。

## 技术
- three.js r180（MIT，文件放在 `v2/vendor/`，不走 CDN、不需要构建），其余是原生 ES Modules。
- 模拟和画面分开：`world.js`、`game.js` 是纯逻辑（不碰 DOM 和 three.js），可以在 Node 里无头运行；`worldview.js`、`gameview.js` 只负责画。
- 静态场景按 128 米分块，走到附近才生成网格，走远就释放；所有人和车共用 3 个实例化网格。出生点约 17 次 draw call。
- 挡住主角的楼、房子、树：以主角为圆心在着色器里抖动镂空（不需要把每栋楼单独画）。

```
v2/index.html        页面、HUD、样式
v2/js/config.js      所有可调数值和调色板
v2/js/world.js       路网、碰撞、视线、水、红绿灯（纯逻辑）
v2/js/game.js        主角、路人、车、车流、警察（纯逻辑，种子随机）
v2/js/mesh.js        把很多小形状烘焙成一个网格
v2/js/worldview.js   地图 → three.js 网格（分块、招牌、地标、镂空着色器）
v2/js/gameview.js    人、车、粒子（实例化）
v2/js/input.js       键盘 + 触屏；orient.js 强制横屏的坐标换算
v2/js/hud.js         小地图、路名、血条、横幅、气泡
v2/js/audio.js       WebAudio 合成音效
v2/js/i18n.js        中英文案
```

## 命令
```
npm run serve            # 打开 http://localhost:8905/v2/?debug=1
npx vitest run tests/unit/v2.test.js
npm run smoke:v2         # 桌面 / 手机横屏 / 手机竖屏，截图在 test-results/smoke-v2/
```
网址参数：`?debug=1` 帧率和 draw call；`?seed=5` 固定随机种子；`?noauto=1` 不自动降画质；`?lang=en`。
