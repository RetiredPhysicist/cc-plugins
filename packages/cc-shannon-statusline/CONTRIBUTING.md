# Contributing

感谢对 `cc-shannon-statusline` 的兴趣。本文档覆盖开发、测试、提交规范，以及如何把改动推到下游消费者（Shannon GUI）做端到端验证。

发版流程见 [`RELEASING.md`](./RELEASING.md)。

---

## 仓库定位

- 这是一个**独立的、公开的** npm 包，仓库 [`RetiredPhysicist/cc-plugins`](https://github.com/RetiredPhysicist/cc-plugins)。
- 唯一职责：作为 Claude Code 的 `PostToolUse` / `Stop` 钩子被调用，渲染 ANSI HUD + 写入 Bridge JSON 文件。
- 不依赖 Shannon 的任何源码；通过 stdin/stdout 协议与 Claude Code 交互，通过文件系统（默认 `~/Library/Caches/shannon/status.json`）与下游 GUI 解耦。

---

## 开发环境

需要：

- Node.js ≥ 22
- Bun ≥ 1.3.11（构建 / 运行脚本均通过 bun，但运行时只依赖 node）

```bash
git clone https://github.com/RetiredPhysicist/cc-plugins.git
cd cc-shannon-statusline
bun install
```

## 常用命令

| 命令 | 作用 |
|------|------|
| `bun run build` | TypeScript → `dist/`，自动加 shebang + chmod 755 |
| `bun run dev` | `tsc --watch` 增量编译 |
| `bun run test:stdin` | 用内置示例 payload 跑一次完整渲染（验证管道通畅） |
| `bunx tsc --noEmit` | 仅类型检查 |
| `bun run sync:shannon` | 构建后把 `dist/` 同步到 Shannon GUI 的 resources 目录（详见下文） |

## 项目结构

```
src/
  index.ts          — 入口：stdin 解析 → 并行数据收集 → render + bridge
  render.ts         — 赛博朋克 ANSI HUD 渲染（7 行）
  bridge.ts         — 写入 JSON Bridge 文件
  config.ts         — 插件配置（`~/.shannon/cc-shannon-statusline/config.json`）
  transcript.ts     — JSONL transcript 解析
  throughput.ts     — transcript 观测速度格式化
  git.ts            — Git 状态检测
  config-counter.ts — 配置文件计数（CLAUDE.md/rules/MCP/hooks）
  stdin.ts          — stdin payload 解析
  path.ts           — 路径规范化与缩写
  types.ts          — 共享 TypeScript 类型
dist/               — 编译产物（.gitignore，npm publish 时打包）
```

## 代码风格

- TypeScript strict 模式，所有公开符号必须有显式类型
- 模块单一职责：渲染逻辑只在 `render.ts`，I/O 只在边界（`index.ts` / `bridge.ts`）
- 注释和代码使用英文；用户面向的字符串若涉及中文请同时支持英文回退
- 不引入运行时依赖（`dependencies` 必须保持为空，devDependencies 仅类型 + 构建工具）—— 这个包的卖点之一就是零运行时依赖
- `rain` 属于插件自己的配置，不写入 Claude Code `statusLine` 对象；默认值必须保持为 `true`
- 速度指标必须标明是 transcript-observed estimate，不得伪称 provider 的 TTFT 或 decode throughput

---

## 与 Shannon GUI 的协作

Shannon 主 app（[`RealAlexandreAI/Shannon`](https://github.com/RealAlexandreAI/Shannon)，私有）会把 statusline 的 **dist 产物**作为 Tauri resource 打包进 macOS app。两个仓库的耦合点只有：

1. Bridge JSON 文件协议（见 `README.md` "Bridge 文件格式"一节）
2. dist 产物的目录结构（`dist/index.js` 是 entry，其他模块按 ESM import 自动加载）

### 端到端验证（如果你也在本地有 Shannon checkout）

改完源码后，把 dist 推到本地 Shannon checkout 验证 GUI 行为：

```bash
# 默认 Shannon 目录是 ~/Desktop/Shannon
bun run sync:shannon

# 自定义 Shannon 路径
SHANNON_DIR=/path/to/Shannon bun run sync:shannon
```

`sync:shannon` 会：

1. 跑 `bun run build` 重新编译
2. `cp -R dist/ "$SHANNON_DIR/src-tauri/resources/statusline-plugin/dist/"`
3. 打印同步路径

**不会**自动 commit Shannon 那边的改动 —— 需要你切到 Shannon 工作区手动 commit `src-tauri/resources/statusline-plugin/dist/` 的变更。

### 已安装到 `/Applications/Shannon.app` 的快速热替换（仅本地调试）

```bash
bun run sync:app
```

直接覆盖已安装的 `.app` bundle 内的 dist。下次启动 Shannon 即生效，无需重新打包。

---

## 提交 / PR

- 分支命名：`feat/xxx`、`fix/xxx`、`chore/xxx`、`docs/xxx`
- Commit 信息走 conventional commits（`feat:`、`fix:`、`chore:`、`docs:`、`refactor:`、`perf:`、`test:` 等）
- PR 请描述：
  - 改动内容
  - 验证方式（至少跑过 `bun run test:stdin`，最好同步过 Shannon 跑一次端到端）
  - 是否影响 Bridge JSON schema —— 如果是，必须在 PR 描述里高亮，并在 Shannon 一侧同步发起对应改动
- CI（`.github/workflows/ci.yml`）会跑 `bun install` + `bun run build` + `bunx tsc --noEmit`，必须绿

---

## Bridge JSON schema 变更政策

Bridge JSON 是 statusline ↔ Shannon 之间的**公开契约**。修改字段需遵守：

- **新增字段**（向后兼容）：minor 版本 bump
- **修改字段含义 / 类型**（向后不兼容）：major 版本 bump，README 中明确 breaking change
- **删除字段**（向后不兼容）：major 版本 bump

Shannon 一侧通过 `serde(default)` 容忍未知字段，但反向不成立 —— 删除字段会让旧版 Shannon 拿到 `null` 或解析失败。
