# 《Who is Mom》当前工程文件说明

> 本文对应当前可运行 Demo，描述实际源码职责。未来功能设想与迭代路线见 `GAME_ARCHITECTURE_AND_PLAN.md`。

## 1. 当前工程边界

当前版本是一款基于 Three.js 的网页 3D 小队管理与轻推理 Demo。玩家带领三只性格不同的蝌蚪沿河调查 NPC，通过有限记忆和两人对证排除误导信息，最后从三只青蛙中选择妈妈。

工程采用四层边界：

1. `game` 保存可序列化规则、案例和模拟状态；
2. `ai` 把固定事实编码成带性格偏差的记忆，远端失败时使用本地确定性回退；
3. `render` 只负责 Three.js 世界、角色表现和状态投影；
4. `ui` 与 `input` 负责 DOM HUD、弹窗、键鼠和触控命令。

Three.js 场景图不是真实游戏状态。行动点、记忆、任务、阶段和结局都由 `GameState` 管理，因此核心玩法可以不启动 WebGL 就进行单元测试。

## 2. 运行链路

```text
index.html
  -> src/main.ts
  -> src/app/createGameApp.ts
      -> GameStore + GameRules
      -> GameDirector + AgentService
      -> RenderHost + WorldBridge
      -> HUD + Input
  -> src/app/gameLoop.ts
      -> 输入采样
      -> 世界移动与接近判定
      -> 调查/对证模拟更新
      -> 相机与 Three.js 渲染
```

一次调查的主要数据流为：

```text
玩家或蝌蚪发起调查
  -> GameDirector 创建 InvestigationTask
  -> GameRules 校验阶段、行动点和角色状态
  -> WorldBridge 让蝌蚪移动到 NPC
  -> AgentService 请求远端 /api/agent
  -> 失败时 LocalAgentFallback 生成合法结果
  -> Contracts 校验结果中的 Fact ID 和字段
  -> MemorySystem 选择三槽之一
  -> GameRules 写入记忆、证据并扣除行动点
  -> HUD 和 Three.js 角色视图根据新状态刷新
```

## 3. 根目录文件

| 文件 | 职责 |
| --- | --- |
| `index.html` | 页面骨架。声明全屏 Canvas、目标条、行动点、小队栏、记忆抽屉、上下文操作栏、触控方向键、弹窗层和结局层。 |
| `package.json` | 项目元数据、Three.js 依赖，以及 `dev`、`build`、`test`、`preview` 脚本。 |
| `package-lock.json` | 锁定 npm 依赖版本，保证本地和部署环境安装结果一致。 |
| `.env.example` | 模型代理所需环境变量示例，不包含真实密钥。 |
| `.gitignore` | 排除依赖、构建产物、本地环境变量和编辑器临时文件。 |
| `vite.config.ts` | Vite 开发服务器与生产构建配置；本地服务器绑定 `127.0.0.1`，构建保留 source map。 |
| `vitest.config.ts` | Vitest 的 Node 测试环境和测试文件匹配规则。 |
| `tsconfig.json` | TypeScript 项目引用入口，组合浏览器端和 Node/Vercel 两套配置。 |
| `tsconfig.app.json` | 浏览器源码的严格 TypeScript 配置。 |
| `tsconfig.node.json` | Vite 配置、测试相关类型和 Vercel Function 的 TypeScript 配置。 |
| `vercel.json` | Vercel 的 Vite 构建、`dist` 输出目录和 `/api/agent` Function 时限配置。 |
| `README.md` | 项目入口说明、本地运行、玩法、验证和模型接入方式。 |
| `GAME_DESIGN_DOCUMENT.md` | 游戏背景、核心循环、AI 原生设计、流程和一日 Demo 范围。 |
| `GAME_ARCHITECTURE_AND_PLAN.md` | 架构原则、Game Jam 项目参考、技术取舍和 Demo 后演进路线。 |
| `PROJECT_STRUCTURE.md` | 当前文件职责与维护边界，也就是本文。 |

`dist/` 是 `npm run build` 生成的生产文件，`node_modules/` 是安装依赖，两者都不是手工维护源码。

## 4. 服务端 AI 代理

| 文件 | 职责 |
| --- | --- |
| `api/agent.ts` | Vercel Function。校验浏览器请求，读取模型环境变量，构造受约束的 Chat Completions 请求，提取 JSON，二次校验结果并返回。模型密钥只存在于服务端环境。 |

该接口不决定妈妈身份、行动点或胜负，只允许模型从请求提供的 Fact ID 或 Memory ID 中选择、遗漏、压缩和转述信息。

## 5. 应用装配与公共类型

| 文件 | 职责 |
| --- | --- |
| `src/main.ts` | 浏览器入口。取得根节点和 Canvas，创建 `GameApp`，启动游戏，并在热更新销毁时释放资源。 |
| `src/app/createGameApp.ts` | Composition Root。创建 Store、AI Service、Director、Three.js Host、角色、HUD 和输入系统；连接订阅关系；统一暴露 `start()` 与 `dispose()`。 |
| `src/app/gameLoop.ts` | 单一 `requestAnimationFrame` 循环。限制异常 delta，按顺序执行 update 和 render，并管理开始/停止。 |
| `src/core/types.ts` | 全工程共享的领域类型：Agent/NPC/Frog ID、记忆、任务、证据、游戏状态和全部 `GameCommand`。 |
| `src/core/assert.ts` | `assertNever` 等穷尽检查辅助，保证 switch 新增分支时 TypeScript 能提示遗漏。 |
| `src/core/eventBus.ts` | 小型同步事件总线。当前核心状态主要通过 Store 驱动，此文件为后续解耦音效、特效或遥测事件保留通用能力。 |

## 6. 固定案例、规则与模拟

| 文件 | 职责 |
| --- | --- |
| `src/game/case/caseTypes.ts` | 定义案例数据结构，包括 NPC、候选青蛙、位置、话题和事实集合。 |
| `src/game/case/demoCase.ts` | 当前关卡的不可变真相：三名 NPC 的九组信息、三只候选妈妈、外观数据和正确妈妈 `marsh-frog`。 |
| `src/game/state/gameState.ts` | 创建初始 `GameState`，包括三只蝌蚪、七点行动、空记忆和开局目标。 |
| `src/game/state/gameStore.ts` | 极小型 Store，提供 `getState`、`dispatch` 和 `subscribe`。所有领域变更都经过 reducer。 |
| `src/game/state/gameRules.ts` | 纯函数 reducer。校验阶段、角色模式和任务 ID，处理调查、召回、对证、行动点、证据、妈妈选择和重开；拒绝召回或结局后的迟到 AI 结果。 |
| `src/game/simulation/gameDirector.ts` | 异步玩法编排器。创建任务、等待交谈时间、调用 AI、生成 Memory/Evidence、开始对证、选择妈妈，并用 generation 隔离重开前的旧请求。 |
| `src/game/memory/memorySystem.ts` | 三槽记忆替换策略。优先空槽，并根据性格、置信状态和强化状态决定需要覆盖的旧记忆。 |
| `src/game/agents/personality.ts` | 将谨慎、冲动、亲和三种性格映射为显示标签、跟随距离、速度、摆动幅度等表现参数。 |
| `src/game/agents/following.ts` | 根据玩家位置、朝向和性格运动参数计算每只蝌蚪的跟随目标。 |

## 7. AI 客户端

| 文件 | 职责 |
| --- | --- |
| `src/ai/contracts.ts` | 定义记忆编码与记忆对证的请求/响应协议，并严格校验任务类型、枚举、长度以及允许的 Fact/Memory ID。 |
| `src/ai/agentService.ts` | 统一 AI 服务门面。优先调用远端适配器，任何网络、超时或校验失败都切换到本地回退。 |
| `src/ai/remoteAgentAdapter.ts` | 调用 `/api/agent`，处理超时、响应解析、结果校验和同请求缓存。 |
| `src/ai/localAgentFallback.ts` | 无模型时的确定性 Agent。模拟不同性格的遗漏和表达，并实现“雨林见闻不是本地证据”等对证规则。 |

AI 输出只是一份受约束的认知建议。真正写入哪个记忆槽、是否扣行动点、证据是否有效，仍由本地规则决定。

## 8. Three.js 渲染层

| 文件 | 职责 |
| --- | --- |
| `src/render/createRenderHost.ts` | 创建 Scene、WebGLRenderer、雾、相机和世界根节点；处理 resize、渲染、WebGL context loss、资源释放和像素诊断。 |
| `src/render/cameraRig.ts` | 管理低 FOV 斜俯视相机，按玩家位置平滑跟随，并适配画布比例。 |
| `src/render/lightingRig.ts` | 创建 HemisphereLight 与 DirectionalLight，提供明快、低成本的卡通照明。 |
| `src/render/materialPalette.ts` | 管理统一世界色盘、三阶 toon gradient、`MeshToonMaterial`/基础材质缓存与销毁。 |
| `src/render/environmentBuilder.ts` | 程序化创建河水、荷塘、河岸、岩石、树、门廊、荷叶、芦苇和移动水面高光；重复植物使用 InstancedMesh。 |
| `src/render/characterFactory.ts` | 程序化创建领队小鱼、三只蝌蚪、蜻蜓、乌龟、河蟹和三种候选青蛙，包括配饰和交互标记。 |
| `src/render/characterView.ts` | 封装角色 Group、选中/高亮/模式状态和程序动画，避免玩法层直接操作 Mesh 细节。 |
| `src/render/viewRegistry.ts` | 定义领域 ID 到角色视图的映射结构，供桥接层按 ID 查找 Three.js 对象。 |
| `src/render/adapters/worldBridge.ts` | 领域状态与 3D 世界之间的桥。处理玩家移动、点击导航、NPC 距离、荷塘判定、小浪近距离自主调查、蝌蚪离队/返回/对证移动和结局站位。 |
| `src/render/geometry.ts` | 小型几何辅助函数，用于设置阴影接收等 Mesh 公共属性。 |

渲染层可被替换为 GLTF 资产而不改变 `GameState`、AI 协议或结局规则。

## 9. 输入、HUD 与调试

| 文件 | 职责 |
| --- | --- |
| `src/input/keyboardController.ts` | 处理 WASD/方向键、1-3 选择、R 召回、M/Tab 记忆和 Escape；同时把触控方向按钮转换为同一移动状态。 |
| `src/input/pointerController.ts` | 使用 Raycaster 识别角色/NPC/青蛙点击，点击水面时生成导航目标，并更新指针样式。 |
| `src/ui/createHud.ts` | 当前全部 DOM UI 的控制器。渲染目标、行动点、小队状态、三槽记忆、调查议题、对证选择、候选妈妈、证据复盘和正确/错误结局。 |
| `src/diagnostics/createDebugPanel.ts` | 仅在 URL 包含 `?debug=1` 时显示，提供跳转三个 NPC 和荷塘的试玩捷径。 |
| `src/styles/tokens.css` | 全局字体、色彩 token、边框、阴影、基础 reset 和可访问焦点样式。 |
| `src/styles/main.css` | Canvas、HUD、抽屉、弹窗、结局、调试栏、桌面与移动端断点、触控方向键和动画的完整样式。 |

## 10. 测试文件

| 文件 | 职责 |
| --- | --- |
| `tests/demoCase.test.ts` | 检查三名 NPC、三个议题、事实 ID 和候选妈妈配置完整。 |
| `tests/memorySystem.test.ts` | 检查空槽优先、三槽覆盖和强化记忆保护策略。 |
| `tests/aiContracts.test.ts` | 检查合法请求/结果通过，未知 ID、错误字段和越权结果被拒绝。 |
| `tests/localAgentFallback.test.ts` | 检查性格化记忆、本地对证和雨林语境质疑逻辑。 |
| `tests/gameRules.test.ts` | 检查调查只扣一次行动、召回后拒绝迟到结果、结局后拒绝迟到结果，以及对证更新置信度。 |

运行全部验证：

```bash
npm test -- --run
npm run build
```

## 11. 常见修改入口

| 想修改的内容 | 首要文件 |
| --- | --- |
| 更换正确妈妈、NPC 证词或候选外观 | `src/game/case/demoCase.ts` |
| 调整行动点、任务阶段和胜负规则 | `src/game/state/gameRules.ts`、`src/game/state/gameState.ts` |
| 调整蝌蚪性格造成的信息遗漏 | `src/ai/localAgentFallback.ts`，并同步 `api/agent.ts` 提示约束 |
| 调整三槽覆盖方式 | `src/game/memory/memorySystem.ts` |
| 增加调查或对证流程 | `src/game/simulation/gameDirector.ts` 与 `src/core/types.ts` |
| 修改跟随手感或自主行动触发 | `src/game/agents/*`、`src/render/adapters/worldBridge.ts` |
| 修改低模角色 | `src/render/characterFactory.ts` |
| 修改河道与植被 | `src/render/environmentBuilder.ts` |
| 修改卡通色阶和色盘 | `src/render/materialPalette.ts`、`src/styles/tokens.css` |
| 修改 HUD、弹窗或移动端布局 | `src/ui/createHud.ts`、`index.html`、`src/styles/main.css` |
| 接入不同模型服务 | `.env.example`、`api/agent.ts` |

修改领域规则时应优先补单元测试；修改 3D 或 UI 时应同时检查桌面和移动端截图、WebGL 像素诊断以及浏览器控制台。
