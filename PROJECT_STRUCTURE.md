# 《Who is Mom》当前工程文件说明

> 本文对应当前可运行 Demo。策划目标见 `GAME_DESIGN_DOCUMENT.md`，架构取舍和后续路线见 `GAME_ARCHITECTURE_AND_PLAN.md`。

## 1. 工程边界

当前版本是一个基于 TypeScript、Three.js 和 Vite 的网页 3D 游戏。玩家在九区域连续水乡中带领三只蝌蚪，完成调查、对证、环境清理、能力学习和妈妈选择。

工程按四层划分：

1. `game` 保存确定性案例、可序列化状态和领域规则；
2. `ai` 负责受约束的记忆编码、对证和跳跃学习判断；
3. `render` 把状态投影为 Three.js 世界、角色和动画；
4. `ui`、`input` 与 `app` 负责 DOM 交互、输入采样、装配和生命周期。

Three.js 场景图不是真实游戏状态。区域发现、任务、疲劳、灵感、记忆、能力、证据和结局全部由 `GameState` 管理，因此核心规则可以在不启动 WebGL 的情况下测试。

## 2. 运行链路

```text
index.html
  -> src/main.ts
  -> src/app/createGameApp.ts
      -> GameStore + GameRules
      -> GameDirector + AgentService
      -> RenderHost + WorldBridge
      -> HUD + Keyboard/Pointer
  -> src/app/gameLoop.ts
      -> 输入采样
      -> 玩家与小队移动
      -> 世界接近判定和任务推进
      -> 相机阻尼跟随
      -> Three.js 渲染
```

一次调查的数据流：

```text
玩家或性格规则发起调查
  -> GameDirector 为每名参与者创建 InvestigationTask
  -> GameRules 校验阶段、疲劳和角色模式
  -> WorldBridge 让蝌蚪移动到 NPC
  -> AgentService 调用 /api/agent
  -> 请求失败时 LocalAgentFallback 生成合法结果
  -> Contracts 校验 Fact ID、Memory ID 和字段
  -> MemorySystem 选择当前容量内的写入槽
  -> GameRules 写入记忆、疲劳和证据
  -> HUD 与角色视图响应 Store 更新
```

## 3. 根目录

| 文件 | 职责 |
| --- | --- |
| `index.html` | 全屏 Canvas 和 DOM UI 骨架：目标、区域、灵感、确认来源、九宫格地图、小队、记忆抽屉、上下文操作、触控方向、弹窗、结局和调试层。 |
| `package.json` | 项目元数据、Three.js 依赖以及 `dev`、`build`、`preview`、`test` 脚本。 |
| `package-lock.json` | 锁定 npm 依赖版本。 |
| `.env.example` | 模型代理环境变量示例，不包含真实密钥。 |
| `.gitignore` | 排除依赖、构建产物、本地环境变量和临时文件。 |
| `vite.config.ts` | Vite 开发服务器和生产构建配置。 |
| `vitest.config.ts` | Vitest Node 测试环境与测试文件匹配规则。 |
| `tsconfig.json` | TypeScript 项目引用入口。 |
| `tsconfig.app.json` | 浏览器端源码的严格 TypeScript 配置。 |
| `tsconfig.node.json` | Vite、测试与 Vercel Function 的 TypeScript 配置。 |
| `vercel.json` | Vercel 静态构建输出和 `/api/agent` Function 配置。 |
| `README.md` | 玩法、操作、本地运行、AI 接入和验证入口。 |
| `GAME_DESIGN_DOCUMENT.md` | 当前游戏设计与扩展方向。 |
| `GAME_ARCHITECTURE_AND_PLAN.md` | 架构原则、开发计划、性能预算和验收策略。 |
| `PROJECT_STRUCTURE.md` | 当前文件职责说明，也就是本文。 |

`dist/` 由 `npm run build` 生成，`node_modules/` 由 npm 管理，两者都不是手工维护源码。

## 4. 服务端 AI 代理

| 文件 | 职责 |
| --- | --- |
| `api/agent.ts` | Vercel Function。校验客户端请求，读取模型环境变量，构造受约束的 Chat Completions 请求，提取 JSON，二次校验后返回。 |

代理支持 `encode_memory`、`reconcile_memories` 和 `judge_jump_learning`。它不决定世界真相、妈妈身份、地图通行、灵感、疲劳或胜负。

## 5. 应用装配与公共类型

| 文件 | 职责 |
| --- | --- |
| `src/main.ts` | 浏览器入口。获取根节点与 Canvas，创建并启动 `GameApp`，热更新时释放资源。 |
| `src/app/createGameApp.ts` | Composition Root。创建 Store、Director、AI 服务、Three.js Host、角色、HUD 和输入系统；连接订阅；暴露调试数据。 |
| `src/app/gameLoop.ts` | 单一 `requestAnimationFrame` 循环，限制异常 delta 并管理开始、停止。 |
| `src/core/types.ts` | 全工程领域类型：区域、NPC、青蛙、障碍、门、记忆、任务、疲劳、跳跃知识、证据、状态和命令。 |
| `src/core/assert.ts` | `assertNever` 等穷尽检查辅助。 |
| `src/core/eventBus.ts` | 小型同步事件总线，为未来音效、特效和遥测解耦保留。 |

## 6. 案例、状态与模拟

| 文件 | 职责 |
| --- | --- |
| `src/game/case/caseTypes.ts` | 定义九区域案例、NPC、候选妈妈、障碍、门和结构化事实的数据形状。 |
| `src/game/case/demoCase.ts` | 当前关卡真相：九个区域、四名 NPC、三只候选妈妈、六个障碍、两种跳跃门和正确妈妈 `marsh-frog`。 |
| `src/game/state/gameState.ts` | 创建初始状态：三只固定性格蝌蚪、3 格记忆、零疲劳、零灵感、未学跳跃和孵化静池起点。 |
| `src/game/state/gameStore.ts` | 极小型 Store，提供 `getState`、`dispatch` 和 `subscribe`。 |
| `src/game/state/gameRules.ts` | 纯 reducer。处理区域发现、调查、清理、疲劳、召回、对证、跳跃、教学、灵感升级、休息、来源计数、妈妈选择和重开。 |
| `src/game/simulation/gameDirector.ts` | 异步玩法编排。创建调查/清理任务、等待交互、调用 AI、限制对证为共同议题、判断跳跃、教学、侦察门和结局条件。 |
| `src/game/memory/memorySystem.ts` | 3-5 格动态容量内的记忆写入与覆盖策略；根据性格、置信状态和强化状态保护或替换旧记忆。 |
| `src/game/agents/personality.ts` | 将谨慎、冲动、亲和三种性格映射为显示标签和运动参数。 |
| `src/game/agents/following.ts` | 依据玩家位置、朝向和性格参数计算跟随目标。 |

## 7. AI 客户端

| 文件 | 职责 |
| --- | --- |
| `src/ai/contracts.ts` | 定义三类 AI 请求/响应并严格校验任务类型、枚举、长度和允许引用的 ID。 |
| `src/ai/agentService.ts` | AI 服务门面。优先调用远端适配器，网络或校验失败时切换到本地回退。 |
| `src/ai/remoteAgentAdapter.ts` | 调用 `/api/agent`，处理超时、响应解析、结果校验和同请求缓存。 |
| `src/ai/localAgentFallback.ts` | 确定性 Agent。模拟性格化信息遗漏、雨林语境纠错、记忆对证和跳跃学习差异。 |

AI 输出只是一份认知建议。记忆写入位置、任务合法性、来源是否计入证据和最终胜负仍由本地规则决定。

## 8. Three.js 渲染层

| 文件 | 职责 |
| --- | --- |
| `src/render/createRenderHost.ts` | 创建 Scene、WebGLRenderer、动态雾距、相机、世界根节点和像素诊断；处理 resize、context loss 与资源释放。 |
| `src/render/cameraRig.ts` | 固定近 top-down 透视相机；按玩家位置和移动方向阻尼跟随，并为窄屏调整距离。 |
| `src/render/lightingRig.ts` | 半球光与平行光组成的柔和低成本户外照明。 |
| `src/render/materialPalette.ts` | 世界色盘、三阶 toon gradient、共享材质缓存和法线外扩局部描边 Shader。 |
| `src/render/environmentBuilder.ts` | 程序化生成 `3×3` 水乡、河岸、地标、植被、石块、六个障碍、两道门、休息荷叶和实例化水面高光。 |
| `src/render/characterFactory.ts` | 生成领路小鱼、三只蝌蚪、蜻蜓、蚱蜢、乌龟、河蟹和三种候选青蛙，附带配饰、假阴影、描边和交互标记。 |
| `src/render/characterView.ts` | 封装角色 Group、选中/高亮/模式状态与自然过渡的程序动画。 |
| `src/render/viewRegistry.ts` | 定义领域 ID 到角色视图的映射。 |
| `src/render/adapters/worldBridge.ts` | 状态与 3D 世界的桥：玩家导航、区域判定、接近高亮、自主调查、任务移动、疲劳跟随、门禁、结局站位和调试传送。 |
| `src/render/geometry.ts` | 小型几何与 Mesh 公共设置辅助。 |

渲染层只读取状态并表达结果，因此将程序化模型替换为 GLTF 不需要重写领域规则。

## 9. 输入、HUD 与样式

| 文件 | 职责 |
| --- | --- |
| `src/input/keyboardController.ts` | WASD/方向键、1-3 选择、R 召回、M/Tab 记忆、Escape 和触控方向输入。 |
| `src/input/pointerController.ts` | 用 Raycaster 识别角色、NPC、青蛙、障碍和门；点击水面时生成移动目标。 |
| `src/ui/createHud.ts` | 渲染区域、灵感、确认来源、地图、小队、疲劳、动态记忆槽、调查、清理、对证、教学、妈妈对话和结局。 |
| `src/diagnostics/createDebugPanel.ts` | 仅在 `?debug=1` 时显示六个区域跳转按钮，便于试玩验收。 |
| `src/styles/tokens.css` | 全局字体、色彩 Token、边框、阴影、reset 和焦点样式。 |
| `src/styles/main.css` | 全屏 Canvas、大色块 HUD、抽屉、弹窗、结局、调试栏、桌面/移动断点与动效。 |

## 10. 测试

| 文件 | 职责 |
| --- | --- |
| `tests/demoCase.test.ts` | 校验九区域、NPC、障碍、门、事实和候选妈妈配置完整。 |
| `tests/memorySystem.test.ts` | 校验空槽优先、动态容量覆盖和强化记忆保护。 |
| `tests/aiContracts.test.ts` | 校验合法 AI 协议通过，未知 ID 和越权结果被拒绝。 |
| `tests/localAgentFallback.test.ts` | 校验性格化记忆、雨林语境质疑和本地对证。 |
| `tests/gameRules.test.ts` | 校验调查幂等、迟到结果、清理奖励、容量升级和独立来源计数。 |
| `tests/gameDirector.test.ts` | 校验只有共同议题才能对证，且 AI 只收到当前议题记忆。 |

验证命令：

```bash
npm test
npm run build
```

## 11. 常见修改入口

| 想修改的内容 | 首要文件 |
| --- | --- |
| 更换正确妈妈、NPC 事实、地图布局、障碍或门 | `src/game/case/demoCase.ts` |
| 调整疲劳、灵感、来源门槛、任务和胜负规则 | `src/game/state/gameRules.ts`、`src/game/state/gameState.ts` |
| 调整 AI 允许做什么 | `src/ai/contracts.ts`、`api/agent.ts` |
| 调整性格化遗漏和本地回退 | `src/ai/localAgentFallback.ts` |
| 调整记忆覆盖与容量 | `src/game/memory/memorySystem.ts` |
| 增加调查、清理、教学或对证流程 | `src/game/simulation/gameDirector.ts`、`src/core/types.ts` |
| 修改跟随、接近范围、通道限制和自主触发 | `src/render/adapters/worldBridge.ts`、`src/game/agents/*` |
| 修改低模角色和动画 | `src/render/characterFactory.ts`、`src/render/characterView.ts` |
| 修改九区域场景和环境物件 | `src/render/environmentBuilder.ts` |
| 修改相机、雾、灯光、toon 色阶和描边 | `src/render/cameraRig.ts`、`src/render/createRenderHost.ts`、`src/render/lightingRig.ts`、`src/render/materialPalette.ts` |
| 修改 HUD、弹窗或移动端布局 | `src/ui/createHud.ts`、`index.html`、`src/styles/*` |

领域规则改动应同步补单元测试；3D 或 UI 改动应同时检查桌面和移动端截图、WebGL 像素诊断、绘制调用和浏览器控制台。
