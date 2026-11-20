# Walkthrough Desk MCP

走查台技术端 MCP。让开发人员的 AI 读取已发布的走查问题与标注截图，在开发人员当前代码仓库完成修正，并将处理状态与验证结果回报到走查台。

## 权限边界

- 可以：读取批次、问题、标注截图；标记处理中；补充说明；回报已修复待复测。
- 不可以：新增、删除或修改走查问题；管理截图；记录复测通过；管理成员。
- 每位开发人员应使用自己的 MCP Token，Token 可由超级管理员随时撤销。

## 安装

需要 Node.js 22.13 或更新版本。

```bash
git clone https://github.com/cruxzhang/walkthrough-mcp.git
cd walkthrough-mcp
npm ci
```

## 取得个人 Token

由走查台超级管理员操作：

1. 登录 [云端走查台](https://walkthrough-desk.designer7-hd2017.workers.dev)。
2. 打开「成员管理」→「技术端 AI（MCP）」。
3. 以「团队／姓名／设备」命名并建立 Token。
4. 透过 1Password 等安全方式交付；不要把 Token 提交到 Git。

## AI 客户端配置

复制 [`config.example.json`](./config.example.json) 的内容到支持 MCP 的 AI 客户端，然后修改：

- `args`：本机 `server.mjs` 的绝对路径。
- `WALKTHROUGH_DESK_TOKEN`：个人专属 Token。

服务地址已经提供默认值；若使用其他环境，可修改 `WALKTHROUGH_DESK_URL`。

## 建议工作指令

在需要修正的代码仓库内启动 AI，并输入：

```text
读取走查台的未关闭问题。每次只处理一个问题：先取得详情与截图，调用 start_issue，再在当前仓库实施最小范围修正并运行相关测试。验证完成后调用 report_issue_fix，写清楚修改内容、验证结果和 commit/PR；无法处理时调用 add_issue_note 说明原因，不要擅自回报已修复。
```

## 工具

- `list_batches`
- `list_issues`
- `get_issue`
- `get_issue_evidence`
- `start_issue`
- `add_issue_note`
- `report_issue_fix`

## 验证

```bash
npm test
```

MCP 使用 `stdio` 通讯。正常运行时 stdout 只用于 MCP JSON-RPC；诊断信息写入 stderr。

