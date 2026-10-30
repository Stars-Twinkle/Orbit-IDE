# Orbit IDE AI Control API

版本：`1.0`  
默认地址：`http://127.0.0.1:37821`（端口冲突时自动顺延，以 IDE 内显示的地址为准）  
鉴权：`Authorization: Bearer <token>`  
传输：JSON over HTTP，仅监听回环地址。

> 这份文档也由运行中的服务提供：`GET /v1/docs`（Markdown）与 `GET /v1/openapi.json`。

---

## 1. 登录与审批

Orbit 不预置 API Key。任何新 AI 客户端都必须发起登录，由用户在 IDE 窗口内确认。

### 1.1 发起登录

```http
POST /v1/login
Content-Type: application/json
```

```json
{
  "clientName": "My Coding Agent",
  "clientId": "my-agent-001",
  "scopes": ["read", "write", "editor", "run"]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `clientName` | 是 | 展示在审批窗口中的客户端名称，最长 80 字符。 |
| `clientId` | 否 | 客户端稳定标识（建议提供 UUID/机器标识）。只有提供它，用户勾选“记住”后才能自动登录。 |
| `scopes` | 否 | 请求权限；缺省为全部权限。只会保留合法 scope。 |

响应 `202 Accepted`：

```json
{
  "requestId": "a6a7…",
  "status": "pending",
  "poll": "/v1/login/a6a7…",
  "expiresInMs": 120000,
  "message": "登录请求已发送到 Orbit IDE，请在 IDE 中批准。"
}
```

此时 IDE 会置顶并打开审批窗口，展示客户端名称、来源地址、请求的权限。

### 1.2 轮询结果

```http
GET /v1/login/{requestId}
```

审批通过后（只发放一次令牌）：

```json
{
  "requestId": "a6a7…",
  "status": "approved",
  "clientName": "My Coding Agent",
  "scopes": ["read", "write", "editor", "run"],
  "token": "orb_…",
  "tokenType": "Bearer",
  "expiresAt": 1793360000000
}
```

其他状态：`pending`、`denied`、`expired`。请求有效期 120 秒。

### 1.3 受信任客户端

用户在审批窗口勾选“记住此客户端”且请求包含 `clientId` 时，后续相同 `clientName + clientId` 的登录会直接返回 `200`，响应中带 `token`，无需再次点击。

用户可以在 AI 面板里随时移除信任关系或撤销在线令牌。

### 1.4 权限（scopes）

| scope | 允许的操作 |
| --- | --- |
| `read` | 状态、文件树、读文件、编辑器读取、问题、测试点读取、编译器列表、设置读取、审计 |
| `write` | 写文件、创建文件/目录、重命名、删除、保存测试点 |
| `editor` | 打开文件、替换内容、插入、替换范围、设置选区、保存、格式化 |
| `run` | 编译、运行、批量评测 |
| `terminal` | 执行终端命令（高风险，默认不授予只读客户端） |
| `mode` | 切换 OI / 开发模式 |
| `compilers` | 扫描、选择编译器、切换标准、手动添加 |
| `settings` | 修改编辑器与界面设置 |
| `ui` | 通知、打开面板 |

服务端按路由强制校验 scope；缺少权限返回 `403 FORBIDDEN_SCOPE`。

---

## 2. 快速示例

### cURL

```bash
BASE=http://127.0.0.1:37821

LOGIN=$(curl -s -X POST $BASE/v1/login \
  -H "Content-Type: application/json" \
  -d '{"clientName":"My Agent","clientId":"agent-001","scopes":["read","write","editor","run"]}')

REQ=$(echo "$LOGIN" | jq -r .requestId)
# 在 IDE 中点击“允许接入”后：
POLL=$(echo "$LOGIN" | jq -r .poll)
TOKEN=$(curl -s "$BASE$POLL" | jq -r .token)

curl -s $BASE/v1/state -H "Authorization: Bearer $TOKEN"
```

### Python

```python
import requests, time

BASE = "http://127.0.0.1:37821"
r = requests.post(f"{BASE}/v1/login", json={
    "clientName": "My Agent",
    "clientId": "agent-001",
    "scopes": ["read", "write", "editor", "run"],
})
req = r.json()
print("请在 Orbit IDE 中批准:", req["requestId"])

while req["status"] == "pending":
    time.sleep(1.5)
    req = requests.get(f"{BASE}{req['poll']}").json()

token = req["token"]
headers = {"Authorization": f"Bearer {token}"}

# 写入文件
requests.put(f"{BASE}/v1/file", headers=headers, json={
    "path": "main.cpp",
    "content": "#include <iostream>\nint main(){ std::cout << 42; }\n",
})

# 编译运行
print(requests.post(f"{BASE}/v1/run", headers=headers, json={
    "path": "main.cpp", "timeoutMs": 10000
}).json())
```

### Node.js

```js
const BASE = 'http://127.0.0.1:37821';
const login = await fetch(`${BASE}/v1/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    clientName: 'My Agent',
    clientId: 'agent-001',
    scopes: ['read', 'write', 'editor', 'run'],
  }),
}).then((r) => r.json());

let status = login;
while (status.status === 'pending') {
  await new Promise((r) => setTimeout(r, 1500));
  status = await fetch(`${BASE}${login.poll}`).then((r) => r.json());
}

const headers = {
  authorization: `Bearer ${status.token}`,
  'content-type': 'application/json',
};
const state = await fetch(`${BASE}/v1/state`, { headers }).then((r) => r.json());
```

---

## 3. REST 接口

所有路径相对于 Base URL。未特别说明均为 JSON。路径参数中的文件路径应使用工作区**相对路径**（如 `src/main.cpp`），也可以使用工作区内绝对路径。

### 3.1 公开接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 存活检查 |
| GET | `/v1/info` | 应用/API 版本、登录说明、操作名列表 |
| POST | `/v1/login` | 发起登录 |
| GET | `/v1/login/{requestId}` | 轮询审批结果 |
| GET | `/v1/docs` | Markdown 文档 |
| GET | `/openapi.json` | OpenAPI 3.1 描述 |

### 3.2 状态与工作区

| 方法 | 路径 | Scope | 说明 |
| --- | --- | --- | --- |
| GET | `/v1/state` | read | 模式、工作区、活动文件、光标、所选编译器、当前会话 |
| GET | `/v1/tree?path=` | read | 文件树；`path` 可只取一个子目录 |
| GET | `/v1/files` | read | 平铺文件列表，适合快速打开 |
| GET | `/v1/file?path=` | read | 读取文本文件 |
| PUT | `/v1/file` | write | 覆盖写入 `{path, content}`，不存在时自动创建父目录 |
| POST | `/v1/files` | write | 创建 `{path, kind:"file"|"dir", content?}` |
| POST | `/v1/file/create` | write | 创建文件的专用接口 `{path, open?}`；省略 `content` 时为空文件 |
| POST | `/v1/folders` | write | 创建目录 `{path}` |
| POST | `/v1/rename` | write | 重命名/移动 `{from, to}` |
| DELETE | `/v1/file?path=` | write | 删除文件/目录（优先回收站） |

> 如果目标文件在编辑器中存在**未保存修改**，写/删/重命名会返回 `409 DIRTY_BUFFER`，避免覆盖用户正在编辑的内容。

### 3.3 编辑器

| 方法 | 路径 | Scope | 说明 |
| --- | --- | --- | --- |
| GET | `/v1/editor` | read | 活动文件内容、路径、行列、选区、dirty |
| POST | `/v1/editor/open` | editor | `{path, line?, column?}` 打开并定位 |
| POST | `/v1/editor/content` | editor | `{content}` 替换全文（Mark dirty） |
| POST | `/v1/editor/insert` | editor | `{text, position?:{line,column}}`，缺省插入光标处 |
| POST | `/v1/editor/replace` | editor | `{range:{startLine,startColumn,endLine,endColumn}, text}` |
| POST | `/v1/editor/selection` | editor | `{startLine,startColumn,endLine,endColumn}` |
| POST | `/v1/editor/save` | editor | 保存当前文件 |
| POST | `/v1/editor/format` | editor | 调用 Monaco 格式化；无格式化器时返回 `formatted:false` |

编辑器行列号均为 **1-based**，与 Monaco 一致。`content/insert/replace` 只改内存缓冲区，需要保存请调用 `editor/save` 或 `PUT /v1/file`。

### 3.4 构建、运行、测试

| 方法 | 路径 | Scope | 说明 |
| --- | --- | --- | --- |
| POST | `/v1/build` | run | `{path?, compilerId?, standard?}` 仅编译 |
| POST | `/v1/run` | run | `{path?, stdin?, timeoutMs?, compilerId?, standard?}` 编译并运行，同步返回 stdout/stderr/退出码 |
| GET | `/v1/tests` | read | 读取 `.orbit/tests.json` |
| PUT | `/v1/tests` | write | 保存 `{cases:[{name,input,expected,enabled}]}` |
| POST | `/v1/tests/run` | run | `{path?, cases?, timeoutMs?}` 编译一次并逐点评测 |
| GET | `/v1/problems` | read | 最近一次编译诊断 |

返回示例（`/v1/run`）：

```json
{
  "success": true,
  "build": {
    "success": true,
    "compiler": { "name": "GCC 8.1.0", "toolchain": "MinGW-w64" },
    "standard": "c++14",
    "durationMs": 412,
    "diagnostics": [],
    "autoFallback": {
      "from": "c++17",
      "to": "c++14",
      "reason": "GCC 8 的 bits/stdc++.h 与 C++17 不兼容"
    }
  },
  "run": {
    "stdout": "3\n",
    "stderr": "",
    "exitCode": 0,
    "timedOut": false,
    "durationMs": 12
  },
  "summary": "运行完成，用时 12 ms"
}
```

### 3.5 终端

| 方法 | 路径 | Scope | 说明 |
| --- | --- | --- | --- |
| POST | `/v1/terminal` | terminal | `{command, cwd?, timeoutMs?}` 单次 PowerShell |

终端命令在每次请求中启动一个新的进程，不保留 shell 状态（环境变量、`cd` 不跨请求）。默认超时 30 秒，最大 300 秒。

### 3.6 模式

| 方法 | 路径 | Scope | 说明 |
| --- | --- | --- | --- |
| GET | `/v1/mode` | read | 当前模式 |
| POST | `/v1/mode` | mode | `{mode:"oi"|"dev"}` |

切到 `oi` 时，IDE 会保存并关闭非 C/C++ 标签页；服务端随后会拒绝非 C/C++ 文件的写入与运行。

### 3.7 编译器

| 方法 | 路径 | Scope | 说明 |
| --- | --- | --- | --- |
| GET | `/v1/compilers` | read | 全部工具链、每个编译器探测到的标准、当前选择 |
| POST | `/v1/compilers/scan` | compilers | `{force?}` 重新扫描；force 重新探测标准 |
| POST | `/v1/compilers/select` | compilers | `{language, compilerId}` |
| POST | `/v1/compilers/standard` | compilers | `{compilerId, standard}` |
| POST | `/v1/compilers/add` | compilers | `{path}` 手动添加可执行文件 |

`language` 取值：`cpp`、`c`、`python`、`javascript`、`java`、`go`、`rust`。

编译器对象示例：

```json
{
  "id": "d41d8cd98f00",
  "kind": "cpp",
  "family": "gcc",
  "name": "GCC 8.1.0",
  "toolchain": "MinGW-w64",
  "version": "8.1.0",
  "executable": "D:\\mingw64\\bin\\g++.exe",
  "target": "x86_64-w64-mingw32",
  "recommendedStandard": "c++2a",
  "oiStandard": "c++17",
  "defaultStandard": "c++17",
  "standards": [
    { "id": "c++98", "label": "C++98", "flag": "-std=c++98", "level": 1998 },
    { "id": "c++17", "label": "C++17", "flag": "-std=c++17", "level": 2017 },
    { "id": "c++2a", "label": "C++20（c++2a）", "flag": "-std=c++2a", "level": 2020, "draft": true }
  ]
}
```

### 3.8 设置、审计、UI

| 方法 | 路径 | Scope | 说明 |
| --- | --- | --- | --- |
| GET | `/v1/settings` | read | 编辑器设置、AI 端口、最近工作区 |
| PATCH | `/v1/settings` | settings | 支持 `fontSize`、`tabSize`、`wordWrap`、`minimap`、`autoSave`、`fontLigatures`、`autoComplete`、`o2Optimization`、`oiPanelHeight` |
| GET | `/v1/audit` | read | 最近 AI 操作、在线会话、受信任客户端 |
| GET | `/v1/clients` | read | 在线会话与信任列表 |
| POST | `/v1/ui/notify` | ui | `{message, type}` 在 IDE 中弹通知 |
| POST | `/v1/ui/open-panel` | ui | `{panel}`：explorer/compilers/ai/terminal/problems/tests/settings |
| GET | `/v1/operations` | read | 全部操作名与所需 scope |

---

## 4. 统一操作入口

除 REST 路由外，所有操作也可通过一个端点调用，便于工具自动生成：

```http
POST /v1/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "op": "file.write",
  "args": {
    "path": "main.cpp",
    "content": "int main(){return 0;}\n"
  }
}
```

`GET /v1/operations` 返回操作名、scope 和说明。操作名与 REST 路径的对应关系：

| 操作 | Scope |
| --- | --- |
| `ide.state` | read |
| `workspace.tree` / `workspace.files` | read |
| `file.read` | read |
| `file.write` / `file.create` / `createFile` / `folder.create` / `file.rename` / `file.delete` | write |
| `editor.get` | read |
| `editor.open` / `editor.setContent` / `editor.insert` / `editor.replace` / `editor.select` / `editor.save` / `editor.format` | editor |
| `problems.get` | read |
| `project.build` / `project.run` / `tests.run` | run |
| `tests.get` | read |
| `tests.set` | write |
| `terminal.exec` | terminal |
| `mode.get` | read |
| `mode.set` | mode |
| `compilers.list` | read |
| `compilers.scan` / `compilers.select` / `compilers.standard` / `compilers.add` | compilers |
| `settings.get` | read |
| `settings.patch` | settings |
| `audit.list` / `clients.list` / `api.operations` | read |
| `ui.notify` / `ui.openPanel` | ui |

---

## 5. 错误格式

```json
{
  "error": {
    "code": "DIRTY_BUFFER",
    "message": "该文件在编辑器中还有未保存的修改，请先保存或让用户处理"
  }
}
```

常见错误码：

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `INVALID_JSON` / `MISSING_*` | 请求格式或参数错误 |
| 401 | `UNAUTHORIZED` | 缺少/失效令牌 |
| 403 | `FORBIDDEN_SCOPE` | 当前会话没有该权限 |
| 404 | `NOT_FOUND` / `LOGIN_NOT_FOUND` | 路径或登录请求不存在 |
| 409 | `NO_WORKSPACE` / `DIRTY_BUFFER` / `NO_ACTIVE_FILE` / `MODE_RESTRICTED` | 状态冲突 |
| 413 | `BODY_TOO_LARGE` | 请求体超过 8 MB |
| 429 | `TOO_MANY_LOGIN_REQUESTS` | 待审批登录过多 |
| 500 | `INTERNAL` | 未预期错误 |

---

## 6. 安全边界

- 服务仅绑定 `127.0.0.1`，不对局域网/公网开放。
- 每个新客户端都需要在 IDE 内人工批准；令牌 24 小时有效，可在 AI 面板撤销。
- 只有提供稳定的 `clientId` 才能被“记住”；未提供时不会自动批准。
- 工作区路径经过规范化与包含性检查，不能借 `..` 跳出根目录。
- OI 模式在服务端强制限制非 C/C++ 文件写入与运行。
- 审计日志记录客户端、方法、路径、状态、耗时与摘要，保留最近 250 条。
- 如果不需要 AI，可关闭 IDE 即停止服务；服务随应用生命周期启动/停止。
