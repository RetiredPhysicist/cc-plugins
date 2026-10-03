# Contributing

感谢对 `cc-shannon-statusline` 的兴趣。本文档覆盖开发、构建、提交规范。

---

## 仓库定位

- 这是一个 **Claude Code 插件**，位于 [`RetiredPhysicist/cc-plugins`](https://github.com/RetiredPhysicist/cc-plugins) 的 `plugins/cc-shannon-statusline/`。
- 唯一职责：作为 Claude Code 的 `statusLine` 命令被调用，渲染 ANSI HUD，并写入 Bridge JSON 文件。
- **不发布到 npm。** 分发走 marketplace：`claude plugin marketplace add RetiredPhysicist/cc-plugins`。
- 不依赖下游任何私有源码；通过 stdin/stdout 与 Claude Code 交互，通过 Bridge 文件与下游解耦。

## 开发环境

- Node.js ≥ 22
- Bun ≥ 1.3.11（仅构建与测试用；运行时只需要 node）

```bash
git clone https://github.com/RetiredPhysicist/cc-plugins.git
cd cc-plugins/plugins/cc-shannon-statusline
bun install
```

## 常用命令

| 命令 | 作用 |
|------|------|
| `bun run build` | TypeScript → `dist/`，自动加 shebang + chmod 755 |
| `bun run dev` | `tsc --watch` 增量编译 |
| `bun test` | 单元测试 |
| `bun run test:stdin` | 用内置示例 payload 跑一次完整渲染 |
| `bunx tsc --noEmit` | 仅类型检查 |

## 项目结构

```
.claude-plugin/plugin.json  — 插件清单
hooks/hooks.json            — SessionStart 钩子，调用 scripts/install.sh
scripts/install.sh          — 把 dist 装到稳定路径，并指向 statusLine
commands/setup.md           — /cc-shannon-statusline:setup，手动重跑安装
src/                        — TypeScript 源码
dist/                       — 编译产物，**必须提交**
```

`dist/` 提交进仓库是刻意的：marketplace 直接分发仓库内容，安装时不跑构建。改了 `src/` 就要跑 `bun run build` 并一起提交；CI 会在 `dist/` 过期时失败。

## 代码风格

- TypeScript strict，公开符号显式标注类型
- 单一职责：渲染只在 `render.ts`，I/O 只在边界（`index.ts` / `bridge.ts`）
- 注释与代码用英文
- **零运行时依赖**（`dependencies` 保持为空）
- `rain` 等属于插件自己的配置，不写进 Claude Code 的 `statusLine` 对象
- 速度指标必须标为 transcript-observed estimate，不得称为 provider 的 TTFT 或 decode throughput
- `scripts/install.sh` 必须保持幂等，且**绝不覆盖用户自己配置的 statusLine**

## 提交 / PR

- 分支命名：`feat/xxx`、`fix/xxx`、`docs/xxx`、`chore/xxx`
- Commit 走 conventional commits（`feat:`、`fix:`、`docs:` …）
- PR 需说明改动内容、验证方式、是否影响 Bridge JSON schema

CI 会跑测试、重新构建并检查 `dist/` 与源码一致、校验 marketplace 与插件清单，必须全绿。

## Bridge JSON schema 变更政策

Bridge JSON 是 statusline ↔ 下游消费者的契约。修改字段时：

- 新增字段：向后兼容
- 改含义 / 类型 / 删除字段：不兼容，需在 PR 与 README 中明确标注
