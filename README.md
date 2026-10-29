# 个人科研工作台

私有、中文、Codex-first 的科研工作台。网页负责结构化数据、文件与任务状态；桌面版 Codex 通过 Site MCP 工具读取任务包并调用已安装的 Nature skills。

## 已实现

- 课表、DDL、无日期待办；手动录入与 CSV 预览/去重导入
- Zotero 7 本地 SQLite 只读快照同步，PDF 按需上传 R2
- 文献多选与 Reader、Paper Card、翻译、引文核验、Paper-to-PPT 任务
- 科研项目、GitHub/本地路径、研究活动、Idea 可行性任务
- D1 元数据、R2 文件、SHA-256 与不可变版本号
- 固定六章节周报草稿、Markdown 编辑/预览/下载与版本记录
- 私有 MCP `/mcp`：读取记录、取得任务包、记录活动、收集周报素材、回写任务与周报

## 本地开发

```bash
pnpm install
pnpm run db:generate
pnpm run dev
```

本地预览使用 Sites mock auth、独立 D1/R2；生产数据库迁移会在 Site 发布时应用。

## Zotero 只读同步

```bash
python3 scripts/zotero_sync.py export \
  --database /Users/kidyvonne/Zotero/zotero.sqlite \
  --output zotero-export.json

python3 scripts/zotero_sync.py push \
  --input zotero-export.json \
  --site https://personal-research-workbench.soundbear25.chatgpt.site
```

`push` 从 macOS Keychain 读取 Sites 调度凭据 `research-workbench-site-token` 和应用层桥接凭据 `research-workbench-bridge-token`。两层凭据必须同时有效；脚本不会写入 Zotero，也不会把服务凭据写入文件或日志。

## Codex 工作流

1. 在文献页或项目页创建任务。
2. 在 Codex 中使用个人科研工作台插件调用 `get_job_bundle`。
3. 按任务指定的 `skill_name` 运行 Nature skill。
4. 产物通过网页或本地桥接上传后，调用 `record_job_result` 回写状态、摘要和 QA。

任何未知事实必须保留为未知或 `needs_input`；工作台不会把模型推断当作实验事实。
