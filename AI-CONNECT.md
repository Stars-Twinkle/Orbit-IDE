# Orbit IDE · AI 连接指南

> 给 AI Agent / Harness 的说明文件。  
> 目标：让 AI 通过 Orbit IDE 的本地 Login 接口发起连接，由用户在桌面端弹窗中批准，然后直接操作 IDE。

---

## 0. 先确认 Orbit IDE 正在运行

按以下顺序查找真实接口地址：

1. `%APPDATA%\Orbit IDE\ai-endpoint.json`
2. 当前工作区 `.orbit\ai-endpoint.json`
3. 如果文件不存在，尝试默认地址：`http://127.0.0.1:37821`
4. 端口可能顺延，尝试 `37821` 到 `37830`

读取 `ai-endpoint.json` 示例：

```json
{
  "app": "Orbit IDE",
  "status": "running",
  "endpoint": "http://127.0.0.1:37821",
  "port": 37821,
  "login": "http://127.0.0.1:37821/v1/login",
  "docs": "http://127.0.0.1:37821/v1/docs"
}
```

先请求：

```http
GET {endpoint}/health
```

返回 `{"ok":true}` 才继续。

如果所有地址都连不上：

- 告诉用户：**请先启动桌面端的 Orbit IDE**。
- 开始菜单或桌面快捷方式：`Orbit IDE`
- 安装版：`%LOCALAPPDATA%\Programs\Orbit IDE\Orbit IDE.exe`
- 绿色版：`C:\Users\Administrator\OrbitApp\OrbitApp.exe`
- 如果出现“Windows 已保护你的电脑 / 未知发布者”，请用户点击 **“更多信息” → “仍要运行”**。
- 启动器日志：安装目录下的 `launcher.log`（绿色版为 `C:\Users\Administrator\OrbitApp\launcher.log`）

不要尝试绕过桌面审批，也不要修改系统安全设置。

---

## 1. 发起 Login 请求

```http
POST {endpoint}/v1/login
Content-Type: application/json
X-Orbit-Client: DeepSeek Harness
User-Agent: DeepSeek-Harness/1.0
```

```json
{
  "clientName": "DeepSeek Harness",
  "clientId": "deepseek-harness-local",
  "scopes": [
    "read",
    "write",
    "editor",
    "run",
    "mode",
    "compilers",
    "ui"
  ]
}
```

说明：

- `clientName`：显示在桌面审批弹窗中的名字，建议使用真实客户端名。
- `clientId`：稳定的客户端标识。只有提供它，用户勾选“记住此客户端”后，后续才能自动登录。
- `scopes`：按需申请，最小权限；不要默认申请 `terminal`，除非确实需要执行命令。
- `X-Orbit-Client` / `User-Agent`：会显示在桌面弹窗的“来源”一行，帮助用户确认是谁在请求。
- **不要**把 token 写进日志、仓库或长期文件。

成功响应 `202`：

```json
{
  "requestId": "8f2c…",
  "status": "pending",
  "poll": "/v1/login/8f2c…",
  "expiresInMs": 120000,
  "message": "登录请求已发送到 Orbit IDE，请在 IDE 中批准。"
}
```

此时桌面端会置顶并弹出审批窗口，显示：

- 客户端名称
- 来源（`X-Orbit-Client` / User-Agent / 127.0.0.1）
- 请求的权限列表
- “记住此客户端”选项

**必须等用户点击“允许接入”**。

---

## 2. 轮询审批结果

```http
GET {endpoint}{poll}
```

建议每 1.5 秒轮询一次，最长 120 秒。

批准后：

```json
{
  "requestId": "8f2c…",
  "status": "approved",
  "clientName": "DeepSeek Harness",
  "scopes": ["read", "write", "editor", "run", "mode", "compilers", "ui"],
  "token": "orb_…",
  "tokenType": "Bearer",
  "expiresAt": 1793360000000
}
```

- `token` 只发放一次，请保存在进程内存中。
- 用户拒绝：`status = "denied"`。
- 过期：`status = "expired"` 或 HTTP 404。
- 受信任客户端再次登录会直接返回 `200` 和 `token`，无需再次弹窗。

---

## 3. 携带 Token 调用接口

```http
Authorization: Bearer orb_…
```

先读状态：

```http
GET {endpoint}/v1/state
```

然后按需调用。完整接口和字段见：

- `GET {endpoint}/v1/docs`（Markdown）
- `GET {endpoint}/openapi.json`
- 项目内 `docs/AI-API.md`

常用操作：

| 目的 | 请求 |
| --- | --- |
| 读文件 | `GET /v1/file?path=main.cpp` |
| 创建文件 | `POST /v1/file/create` body `{path, open?}`；省略 `content` 即创建空文件，需要内容再 `PUT /v1/file` |
| 写文件 | `PUT /v1/file` body `{path, content}` |
| 打开文件 | `POST /v1/editor/open` body `{path, line?, column?}` |
| 插入内容 | `POST /v1/editor/insert` body `{text, position?}` |
| 保存编辑器 | `POST /v1/editor/save` |
| 编译运行 | `POST /v1/run` body `{path, stdin?, timeoutMs?}` |
| 编译 | `POST /v1/build` body `{path}` |
| 批量评测 | `POST /v1/tests/run` body `{path, cases?}` |
| 切换模式 | `POST /v1/mode` body `{mode:"oi"|"dev"}` |
| 编译器列表 | `GET /v1/compilers` |
| 选择编译器 | `POST /v1/compilers/select` body `{language, compilerId}` |
| 通用入口 | `POST /v1/execute` body `{op:"file.write", args:{...}}` |

统一操作入口适合工具自动生成：`GET /v1/operations` 返回全部 39 个操作名、scope 和说明。

---

## 4. Harness 可直接使用的 PowerShell 流程

```powershell
$endpointFile = Join-Path $env:APPDATA 'Orbit IDE\ai-endpoint.json'
$endpoint = 'http://127.0.0.1:37821'
if (Test-Path $endpointFile) {
  $endpoint = (Get-Content $endpointFile -Raw | ConvertFrom-Json).endpoint
}

$loginBody = @{
  clientName = 'DeepSeek Harness'
  clientId   = 'deepseek-harness-local'
  scopes     = @('read','write','editor','run','mode','compilers','ui')
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "$endpoint/v1/login" `
  -Headers @{ 'X-Orbit-Client' = 'DeepSeek Harness' } `
  -ContentType 'application/json' -Body $loginBody

Write-Host '请在 Orbit IDE 桌面弹窗中点击“允许接入”…'

while ($login.status -eq 'pending') {
  Start-Sleep -Milliseconds 1500
  $login = Invoke-RestMethod -Uri "$endpoint$($login.poll)"
}

if ($login.status -ne 'approved') { throw "登录未通过：$($login.status)" }
$headers = @{ Authorization = "Bearer $($login.token)" }

(Invoke-RestMethod -Uri "$endpoint/v1/state" -Headers $headers) | ConvertTo-Json -Depth 8
```

---

## 5. 失败处理

| 情况 | 处理 |
| --- | --- |
| `health` 连不上 | 请用户启动 Orbit IDE；不要猜测端口之外的网络地址 |
| `401 UNAUTHORIZED` | token 失效，重新走 `POST /v1/login` |
| `403 FORBIDDEN_SCOPE` | 重新登录并申请缺失 scope，或让用户批准 |
| `409 NO_WORKSPACE` | IDE 没有打开工作区，让用户“打开文件夹” |
| `409 DIRTY_BUFFER` | 文件有未保存修改，先保存或让用户处理，不要强行覆盖 |
| 登录一直 `pending` | 用户还没在桌面点击；提示用户查看桌面弹窗 |
| 登录 `denied` | 用户拒绝；不要重试刷屏，先询问用户 |

---

## 6. 安全约束（必须遵守）

- 只能操作 `127.0.0.1` 本地接口。
- 首次连接必须由用户桌面弹窗人工批准。
- 不要请求超出任务需要的 scope，尤其是 `terminal`。
- 不要在对话、日志、代码仓库中暴露 token。
- 不要尝试自动点击桌面审批框。
- OI 模式在服务端禁止非 C/C++ 文件写入/运行；不要尝试绕过。

---

## 7. 最短版本（给 Agent 的 TL;DR）

1. 读 `%APPDATA%\Orbit IDE\ai-endpoint.json` 获取 `endpoint`。
2. `GET /health`。
3. `POST /v1/login`，带 `clientName`、`clientId`、最小 `scopes`、`X-Orbit-Client`。
4. 轮询 `poll`，等用户在桌面点“允许接入”。
5. 拿到 `token`，后续请求带 `Authorization: Bearer`。
6. 先 `GET /v1/state`，再按需调用 `/v1/file`、`/v1/editor/*`、`/v1/run` 等。
