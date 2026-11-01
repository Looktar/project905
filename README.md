# Project 905 · 万锦玩具城

在“熟人一眼能认出来”的万锦街道上溜达、打路人、抢车开，小心警察！
轻松休闲的 3D 卡通小游戏，电脑和手机浏览器都能玩。

**👉 试玩：https://looktar.github.io/project905/**

## 操作
- **电脑**：WASD / 方向键移动，Shift 跑，空格出拳（开车时是手刹漂移），F 上下车，H 喇叭
- **手机**：横着拿（竖屏会自动转成横屏），左边摇杆移动，右边按钮：拳 / 上车 / 跑

- **设置**：右上角 ⚙ 可以切换语言、声音、小地图大小、阴影、微缩景深、清晰度（手机卡的话会自动降画质）

## 地图里能找到
Hwy 7 × Kennedy 路口（出生点，有红绿灯）、Kennedy / Warden / McCowan、Rouge 河、407 高架、大古广场（屋顶巨型奶茶）、Markvile Mall（巨型购物袋）、万锦市政厅、Unionville 老街和 Toogood Pond 凉亭、Downtown Markham 和 Cineplax 影城（屋顶爆米花桶）、5 家 Tim Hortz（屋顶巨型甜甜圈）、红色 Viva 快速公交道和车站……

## 测帧率
手机打开 https://looktar.github.io/project905/?bench=1 ，等 20 秒，截图结果发给开发者。

## 开发
游戏本身零依赖、零构建（原生 WebGL2）。开发工具：`npm ci`，然后 `npm run lint && npm test && npm run smoke`。详见 `CLAUDE.md`。

## 致谢
地图数据 © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors（ODbL）。
所有模型和音效均为程序生成。游戏内店名均为谐音恶搞，与真实商家无关。
