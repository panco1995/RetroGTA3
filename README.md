# RetroGTA3

GTA3 剧情的 2D 俯视复刻（非商业同人项目）。技术栈：TypeScript 7 + Vite 8 + Phaser 3.90。

> **版权**：GTA3 的剧情、台词、角色、商标、美术、音频均属 Rockstar Games / DMA Design。
> 本项目不包含任何原版资源，全部美术素材为 CC0 授权或代码生成。详见 [素材与授权](#素材与授权)。

---

## 文档

| 文档 | 内容 |
|---|---|
| [DECISIONS.md](DECISIONS.md) | 技术选型论证、素材管线设计、烘焙参数推导、朝向判据、自检规则 |
| [ROADMAP.md](ROADMAP.md) | 分阶段目标、已完成项、待办 |
| `docs/preview-characters.png` | 角色烘焙产物核对图（多方向 × 多帧 + NPC 配色变体） |
| `docs/preview-cars.png` | 载具烘焙产物核对图（多款车型 × 4 正交方向） |

---

## 现状

- 单场景可玩切片：街道 + 建筑 + 步行 + 上/下车 + 街机式车辆物理 + 6 类 NPC 行人。
- 载具与角色动画全部来自离线 3D 烘焙，运行时只加载 2D spritesheet。
- 任务系统为数据驱动：`content/missions/*.json` + 对白 JSON，配套 schema 校验器。

---

## 环境要求

| 依赖 | 版本 | 用途 |
|---|---|---|
| Node.js | ≥ 22.18 | 脚本以原生 TypeScript 执行（`node file.ts`） |
| npm | 随 Node | 依赖安装 |
| GNU Make | ≥ 3.81 | 任务编排（Makefile 兼容 GNU Make 3.81 + bash 3.2） |
| Playwright Chromium | — | 离线烘焙渲染、截图自检；仅开发期需要 |

Vite 8 的 dev server 与 preview 端口在 `vite.config.ts` 中固定（strictPort），避免与其它本地服务抢占。

---

## 快速开始

```bash
git clone <repo>
cd RetroGTA3
make setup     # npm install + playwright install chromium + npm run gen
make dev       # dev server（端口见 vite.config.ts）
```

`make setup` 执行后即可运行 —— 烘焙产物（角色 / 载具 spritesheet）已随仓库提交，无需本地重烘。

环境自检：

```bash
make doctor
```

---

## 架构

### 运行时边界（硬约束）

运行时是纯 2D 的：

- `src/` 中不存在任何 Three.js 引用；`dist/` 产物中亦不含 three 标记。
- Three.js 仅在离线烘焙阶段出现一次（`tools/bake/`），产出物是 PNG。
- 运行时依赖仅 `phaser`；`three` / `@napi-rs/canvas` / `playwright` / `vitest` 均为 devDependencies。

这条边界等价于 GTA3 原始做法：内部 3D 模型预渲染为序列帧。

### 目录

```
src/
  main.ts            Phaser.Game 配置与场景注册
  scenes/
    BootScene.ts     资产加载 + manifest 解析 + 缺资产拦截
    StreetScene.ts   场景组装、输入、驾驶/步行状态机、调试接口
  game/
    Actor.ts         烘焙精灵角色（多方向动画，按角度取帧）
    Player.ts        玩家
    Vehicle.ts       载具（多方向，按车头角取帧，精灵不旋转）
    Pedestrians.ts   NPC 行人
    physics.ts       街机式车辆物理（速度矢量分解 + 抓地力/漂移）
  city/
    StreetBuilder.ts 街道布局装配
  assets/baked.ts    烘焙资产常量（单元尺寸 / 锚点 / 车型表）
  core/rng.ts        确定性 PRNG（mulberry32）

tools/bake/          离线烘焙管线（Node + Playwright + Three.js）
scripts/gen-assets/  程序化素材生成（Canvas2D → atlas）
scripts/dev/         预览图与任务校验工具
content/missions/    任务定义（JSON）
content/dialogues/   对白（JSON）
```

### 场景流程

`BootScene.preload()` 加载 `atlas.png` + 两份 manifest（角色 / 载具），解析后写入运行时配置：

- 角色 spritesheet 按 manifest 列出的动画加载，单元尺寸取 manifest 的 `cell`。
- 载具 spritesheet 单元尺寸与锚点由 manifest 决定，写入 `CAR_RUNTIME`，`Vehicle` 运行时读取。
  这些值由烘焙脚本按全部车型的投影范围计算得出，随车型表变化，因此**不可硬编码**。

任一必需资产缺失时 `BootScene` 中止场景切换并显示缺资产提示（列出应执行的命令），不做降级渲染。

---

## 素材管线

```
CC0 低模（角色 / 车模）
  → tools/bake/*.ts        离线 Three.js 正交相机渲染
  → assets-src/baked/**.png
  → npm run gen            拷贝至 public/assets/proc/baked/
  → Phaser spritesheet

程序化素材（地面 / 建筑 / 道具）
  → scripts/gen-assets/*.ts  Canvas2D 生成
  → public/assets/proc/atlas.png + atlas.json
```

分工边界：程序化负责几何物件；角色与载具一律走烘焙管线。生成物由 `mulberry32(seed)` 确定性重建。

**规格的单一事实源是 manifest**：单元尺寸、方向与帧数、锚点均由烘焙脚本按内容实测计算，
写入 `assets-src/baked/**/manifest.json`，运行时由 `BootScene` 读取并注入渲染配置。
代码中不保留常量副本 —— 车型表或角色模型一变，规格自动跟随。

烘焙管线内置自检：逐帧 alpha 边界校验（贴边即失败退出），载具额外做朝向断言
（k=0 与 k=16 的 alpha 轮廓不匹配率 ≤ 3%，错误朝向会被自动捕获并以退出码 1 失败）。

---

## 命令

`make help` 输出全部 target。常用项：

| 命令 | 说明 |
|---|---|
| `make setup` | 新机初始化：安装依赖 + Chromium + 生成素材 |
| `make doctor` | 环境自检 |
| `make dev` | 开发服务器（`predev` 自动生成素材） |
| `make build` | 生产构建（`prebuild` 自动生成素材） |
| `make check` | 完整自检：typecheck → 任务校验 → 单测 → 角色烘焙 → 载具烘焙自检 → gen → 截图 |
| `make bake` | 烘焙角色（多方向动画 + NPC 配色变体） |
| `make bake-vehicles` | 烘焙载具（多款车型 × 多方向，含裁切与朝向自检） |
| `make bake-vehicles-check` | 仅运行载具烘焙自检，输出至 `tmp/` |
| `make gen` | 生成程序化素材并拷贝烘焙产物 |
| `make shot` | Playwright 截图自检 → `.shots/`，含运行时状态回读与页面错误捕获 |
| `make preview-characters` / `make preview-vehicles` | 生成核对图至 `docs/` |
| `make mission MISSION=portland-01` | 查看单个任务定义 |
| `make mission-validate` | 校验全部任务 JSON |

npm scripts：`bake` / `bake:vehicles` / `gen` / `gen:zoom` / `shot` / `test` / `typecheck` / `missions` / `mission:validate`。

---

## 版本控制边界

| 路径 | 纳入版本控制 | 说明 |
|---|---|---|
| `src/` `tools/` `scripts/` `content/` | ✅ | 源码 |
| `assets-src/baked/**.png` | ✅ | 烘焙产物属美术资产，重建需 Playwright + 浏览器，无法仅靠 `npm run gen` 完成 |
| `assets-src/characters/` `assets-src/vehicles/` | ✅ | CC0 源模型 |
| `public/assets/proc/` | ❌ | `npm run gen` 确定性重建 |
| `assets-src/baked/textures/` | ❌ | NPC 换色中间贴图 |
| `.shots/` `dist/` `tmp/` | ❌ | 产物 |

仅在修改车型表或角色源模型时才需本地重烘。

---

## 素材与授权

| 资产 | 来源 | 授权 |
|---|---|---|
| 角色模型 | [Quaternius Animated Human](https://opengameart.org/content/animated-human)（OGA node 78590） | CC0 1.0 — 原文 `assets-src/characters/animated-human/LICENSE.txt` |
| 载具模型 | [Kenney Car Kit 3.1](https://opengameart.org/content/kenney-car-kit) | CC0 1.0 — 原文 `assets-src/vehicles/kenney-car-kit/License.txt` |
| 其余 | 代码程序化生成 | 本项目自制 |

CC0 许可原文必须随项目保留。
