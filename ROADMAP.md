# RetroGTA3 — 阶段路线图

总原则：**每个阶段必须交付一个"能玩 5 分钟"的切片**，而不是一堆没接起来的半成品系统。

---

## Phase 0 · 骨架（地基）✅ 已完成

**工程**

- [x] Vite 8 + TypeScript 7 + Phaser 3.90.0 工程（`npm run dev` / `npm run build`）
- [x] Makefile：每个命令一个独立 target（`make help` 查看全部）
- [x] Playwright 截图自检闭环（`npm run shot` → 场景截图 + 运行时状态回读 + 页面错误捕获）
- [x] 车辆物理单元测试（`npm run test`）

**素材**

- [x] 程序化素材生成器：瓦片 / 建筑 / 道具 → `npm run gen`
- [x] 固定调色板（单一事实源）→ `scripts/gen-assets/core.ts`
- [x] 程序化素材打包成单张 atlas.png + atlas.json
- [x] 素材放大核对工具 → `npm run gen:zoom`
- [x] 角色：CC0 低模 → 离线烘焙 → 多方向动画精灵图（`npm run bake`，实测取景 + 逐帧防裁切校验）
- [x] NPC 变体：贴图纯色区换色，一套模型产出多个 NPC 配色（配色表 `tools/bake/npc-palettes.ts`）
- [x] 载具：Kenney Car Kit（CC0）→ 多款车型 × 多方向精灵图（`npm run bake:vehicles`）
      —— 固定相机两遍法保证所有车型缩放一致；每款车独立世界车长
- [x] 载具朝向自检：k=0 与镜像 k=16 的 alpha 轮廓不匹配率 ≤ 3%，写入脚本内断言，错误朝向退出码 1
- [x] 烘焙参数运行时读 manifest：单元尺寸与锚点由烘焙脚本按车型表计算
      （manifest → BootScene → CAR_RUNTIME → Vehicle），不可硬编码
- [x] 按角度取帧：角色与载具均按朝向取 spritesheet 帧，精灵本身不旋转
- [x] 建筑立面程序化生成器（窗框/砖缝/招牌/空调机位）—— 不整块烘焙，楼要能随机组合

**玩法**

- [x] 街机式车辆物理：速度矢量分解 + 抓地力/漂移 + 建筑碰撞（`src/game/physics.ts`）
- [x] 摄像机跟随 + 俯视视角 + 世界边界钳制
- [x] 上/下车交互，驾驶时隐藏玩家角色

**数据**

- [x] 任务数据层：JSON 任务定义 + 对白 + 校验器（`make mission-validate`）

**验收**：✅ `npm run shot` 产出"角色站在街上、身后有车、视角正常"的截图。

**待办（素材管线）**
- [ ] 统一后处理（描边/暗角/色阶），把烘焙素材和程序化素材拉到同一套质感上

---

## Phase 1 · 沙盒驾驶（Portland 单街区）← 下一步

- 程序化街区生成：路网 → 地块 → 建筑
- 交通 AI：车流沿路网行驶
- 行人 AI：路口等待 / 避让 / 逃跑（当前仅沿人行道直线来回走，`src/game/Pedestrians.ts`）
- 车辆性能分级（普通车 / 警车 / 跑车）
- 玩家上下车判定、上车动画
- 撞车损伤与维修（Pay'n'Spray）
- 巷战：路障、跳车、路缘石减速

**验收**：能开车在街上兜圈、撞车有反应、能下车走路、路人车流看起来像活的。

---

## Phase 2 · 任务系统 + 第一个完整任务

- `MissionRunner` + 目标类型（goto/kill/driveTo/collect/timed/...）
- 任务触发器、失败/成功流程、任务标题卡（AI 生图 + 后处理）
- 对话系统（头像 + 打字机文字 + 表情）
- 通缉系统（警车追捕、★ 等级）
- 电话系统（接任务）
- 存档 / 读档

**验收**：完整跑通任务 1 "Give Me Liberty"，含开场标题卡、对话、失败重试、成功结算。

---

## Phase 3 · 三城 + 全任务

- Portland → Staunton Island → Shoreside Vale 三张地图
- 48 个主线任务 + 支线（Taxi / Vigilante / Rampage / School Bus / Phone 任务）
- 隐藏包（100 个）、跳车（Unique Jumps）、武器拾取
- 载具改装（Pay'n'Spray 换色）
- 电台系统（AI/CC0 音乐 + DJ 台词）

**验收**：能从任务 1 一路打到结局任务，中途无卡死。

---

## Phase 4 · 打磨

- 音效全量 WebAudio 合成（引擎/警笛/枪声/爆炸/脚步）
- 粒子特效（爆炸、烟雾、雨水）
- HUD 完善、菜单、设置
- 性能优化（traffic/ped 剔除、LOD）
- 桌面版打包（Tauri 套壳）

---

## 风险登记

| 风险 | 触发信号 | 应对 |
|---|---|---|
| 长线烂尾 | 连续两个阶段没产出可玩切片 | 砍内容保切片，先把 Phase 2 做完 |
| 剧情量压垮进度 | 任务 JSON 写得比引擎代码还慢 | 优先通用 runner，任务数据批量生成 |
| 车辆手感调不好 | 反复调参数超过 1 天 | 参考 GTA1/2 的 arcade 手感基准值，不要追求仿真 |
| 素材风格漂移 | 截图里素材拼在一起很违和 | 统一后处理 + 收紧调色板 + 限制外部素材包引入 |
