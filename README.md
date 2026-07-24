# Who is Mom

一个以《小蝌蚪找妈妈》为原型的 AI 原生小队管理与轻推理游戏。当前仓库包含一个可完整通关的 Three.js 网页 Demo：带领三只性格不同的蝌蚪沿河调查、管理三槽记忆、安排对证，并从三只候选青蛙中找出妈妈。

## 当前玩法

- 使用 WASD、方向键、点击河面或移动端触控按钮带领小队；
- 接近蜻蜓、乌龟和河蟹后，选择蝌蚪与调查议题；
- NPC 对话对玩家不可见，信息只能从蝌蚪带回的有限记忆中获取；
- 安排两只蝌蚪对证，质疑缺少地点语境的旅行见闻；
- 前往月牙荷塘选择妈妈，查看正确或错误结局与证据复盘。

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址由 Vite 输出。仅运行 Vite 时，`/api/agent` 不存在，客户端会自动使用本地确定性 Agent 回退。

在地址后添加 `?debug=1` 可显示试玩跳转面板，例如：

```text
http://127.0.0.1:5173/?debug=1
```

## 验证

```bash
npm test
npm run build
```

## 模型接入

复制 `.env.example` 中的变量到 Vercel 项目环境变量。浏览器只访问 `/api/agent`，不会接触模型密钥。接口默认使用：

```text
POST ${MODEL_BASE_URL}/chat/completions
Authorization: Bearer ${MODEL_API_KEY}
```

## 文档

- `GAME_DESIGN_DOCUMENT.md`：游戏策划方案；
- `GAME_ARCHITECTURE_AND_PLAN.md`：架构取舍与后续演进计划；
- `PROJECT_STRUCTURE.md`：当前工程每个文件的职责与常见修改入口。
