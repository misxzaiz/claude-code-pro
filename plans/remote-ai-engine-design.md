# 远程 AI 引擎支持：详细设计方案

> 状态：方案定稿，待实施
> 范围：Phase 1 MVP — 远端 AI 完整执行（含 MCP + 远端工作区），本地纯转发
> 决策记录：纯远端语义（禁用本地文件操作）/ 远端工作区自动拉取远端 config.workspaces / 仅 Phase 1

---

## 1. 需求

1. 设置远程 AI 引擎
2. 新建会话时使用远程 AI 引擎
3. 远程 AI 引擎对应远程工作区选择

**语义定义（已确认）**：AI 引擎运行在远端机器，AI 的工具调用也在远端执行（远端 MCP + 远端文件系统）。本地 Polaris 仅作为转发壳，不做任何本地文件操作。

---

## 2. 架构

```
┌─ 本地 Polaris ────────────────────────┐      ┌─ 远端 Polaris（Web 服务开启）─────────┐
│                                       │      │                                      │
│  NewSessionButton                      │  HTTP │  POST /api/chat/send               │
│  ├─ 引擎选择器 ─┐                      │ ────► │    { message, sessionId?, options } │
│  └─ 远端工作区 ─┤ 选 remote-{hostId}/  │      │        ├─ engineId: <远端真实引擎>   │
│                 │    {engineId}        │      │        ├─ workDir: <远端绝对路径>    │
│  sessionStoreManager                    │      │        └─ contextId: "session-<本地id>"
│    metadata.engineId =                 │      │                                      │
│      "remote-host01/claude-code"       │      │    远端本地 spawn: AI CLI + 远端 MCP │
│    metadata.remoteWorkspacePath = ...  │      │      cwd = 远端 workspace path      │
│    │                                     │      │                                      │
│    ▼ sendMessage                        │      │    事件: dual_emit                   │
│  invoke('start_chat', { options: {      │      │      WS: {event:"chat-event",       │
│    engineId: "remote-host01/claude-code",│     │        payload:{contextId, payload}} │
│    remoteWorkDir: <远端路径>,            │      │                                      │
│    ...                                  │      │                                      │
│  })                                     │      └──────────────┬───────────────────────┘
│    │                                     │                     │
│    ▼                                     │                     │ WS GET /api/ws?token=md5
│  chat.rs::start_chat_inner                │                     │
│    parse_remote_engine_id("remote-...")  │                     ▼
│      → host="host01", engine="claude-code"   ┌─ 本地事件泵 ────────────────────────┐
│    检测 starts_with("remote-")            │      │  订阅远端 /api/ws?token=            │
│      → 走 HTTP 转发 + WS 事件泵            │◄─── │  按 contextId=="session-<本地id>" 过滤│
│      → 跳过 MCP/附件/工作区prompt/failover │      │  → callbacks.emit_event(event_json) │
│      → 原包转发给本地 event_broadcast      │      └─────────────────────────────────────┘
└───────────────────────────────────────────┘
                                                              │
                                                              ▼
                                                     本地 eventRouter
                                                     (按 contextId="session-{id}" 路由)
                                                     → 零改动
```

### 2.1 为什么是"本地转发"而不是"前端直连远端"

前端已有 `httpTransport`，理论上可以直连远端 `/api/chat/send` + `/api/ws`。**但不采用**，理由：

1. **会话归属**：本地 `sessionStoreManager` 是会话真相源。前端直连远端意味着本地要维护远端 WS 连接的生命周期、重连、断线恢复（`webReconnectResync`），而这些逻辑是围绕本地服务写的。
2. **鉴权边界**：远端 token 落在本地 Rust 侧加密存储，不进入前端 localStorage，前端无权限直连远端。
3. **能力对齐**：`start_chat_inner` 是唯一的"请求构造点"（MCP 配置、附件处理、供应商路由、事件回调）。转发逻辑放在这一层，与本地引擎路径共享 95% 代码。
4. **中断/续聊对称**：`continue_chat_inner` / `interrupt_chat` 同样在此层分发，三个操作一处改动。

代价：HTTP POST 的 body 需要在 Rust 侧转发一次（而非前端直传）。这是可接受的，因为 `start_chat` 本身是 fire-and-forget（立即返回 sessionId，事件走 WS）。

---

## 3. 数据模型

### 3.1 `RemoteEngineConfig`（Rust）

新文件 `src-tauri/src/models/remote_engine.rs`：

```rust
use serde::{Deserialize, Serialize};

/// 单个远程引擎主机配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEngineConfig {
    /// 稳定 ID，引擎级 ID 编码为 `remote-{host_id}/{engineId}`（见 impl 下方 engine_id_of）
    pub host_id: String,
    /// 显示名称
    pub name: String,
    /// 远端服务地址（不带协议头，如 "192.168.1.10:9830"）
    /// 完整 URL 由 `remote_engine_url()` 派生
    pub url: String,
    /// 鉴权 token 明文（AES 加密后落盘，见 §3.3）
    pub token: String,
    /// 远端引擎元数据缓存（同步时写入）
    /// key = 远端真实引擎 ID（如 "claude-code"），value = 完整元数据
    #[serde(default)]
    pub engines: Vec<EngineMetadata>,
    /// 远端工作区缓存（同步时写入）
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
    /// 最后同步时间（Unix 秒）
    #[serde(default)]
    pub last_synced_at: i64,
    /// 是否启用
    #[serde(default = "default_true")]
    pub enabled: bool,
}

impl RemoteEngineConfig {
    /// 该 host 上某个远端引擎对应的本地 EngineId 字符串。
    /// 引擎级 ID（非 host 级）：一台远端机器通常跑 4+ 个引擎（claude-code/codex/simple-ai/pi，
    /// 见 traits.rs:114-121），若只编码 host，选择器里同一 host 的多个引擎 ID 会重复。
    pub fn engine_id_of(&self, remote_engine: &str) -> String {
        format!("remote-{}/{}", self.host_id, remote_engine)
    }

    /// 完整 HTTP 基地址
    pub fn base_url(&self) -> String {
        if self.url.starts_with("http://") || self.url.starts_with("https://") {
            self.url.clone()
        } else {
            format!("http://{}", self.url)
        }
    }
}

/// 从本地 EngineId 字符串解析出 (host_id, 远端目标引擎 ID)。
/// 引擎 ID 不含 '/'（已核实 src-tauri/src/ai/engine/*.rs），split_once 无歧义。
///
/// 注意：不要直接调用 EngineId::parse_any 后再 strip_prefix —— 解析会丢失原始字符串。
/// 必须在 chat.rs 的转发分支里对 `options.engine_id: String` 做字符串解析。
pub fn parse_remote_engine_id(engine_id: &str) -> Option<(&str, &str)> {
    let rest = engine_id.strip_prefix("remote-")?;
    let (host_id, target) = rest.split_once('/')?;
    Some((host_id, target))
}

fn default_true() -> bool { true }
```

**为什么是引擎级而非 host 级 ID**：
- host 级 `remote-{hostId}` 会让 §5.6 的 `hosts.flatMap(h => h.engines.map(...))` 生成重复 ID —— 同一 host 的 Claude 和 Codex 无法区分，picker 出现重复项
- 引擎级 `remote-{hostId}/{engineId}` 让 host 与目标引擎均从 ID 单一来源解析，无需在 `SessionMetadata` / `ChatRequestOptions` 中额外存 `remoteTargetEngine` 字段
- `EngineId::parse_any("remote-host01/claude-code")` 落到 `Custom("remote-host01/claude-code")`（`traits.rs:98-100`），既有 `Custom` 精确匹配（如 `dsh`）不受影响

### 3.2 持久化

- 文件：`data_root().config_dir().join("remote-engines.json")`
- 参照 `commands/mobile_config.rs:1-75` 的模式（`read_config_inner` / `write_config_inner` + 临时文件原子替换）
- 顶层结构：`{ "hosts": Vec<RemoteEngineConfig> }`

### 3.3 Token 加密

参照 `services/personal_hub_crypto.rs`（AES-128-CBC + base64，前端 crypto-js 兼容）。密钥来源：`config.interaction` 下新增 `remote_engine_cipher_key`，或复用现有 `personal_hub.encryption_key`（若已存在则复用，避免新增密钥面）。

**存储策略**：`RemoteEngineConfig.token` 落盘时加密，读入时解密到内存。Tauri 命令返回给前端时**不返回 token**（返回 `token_set: bool`）。

### 3.4 `EngineMetadata` 复用

直接复用现有 `crate::ai::EngineMetadata`（`traits.rs:762-790`），远端通过 IPC bridge 返回的同结构数据可直接反序列化。缓存时保留远端原始引擎 ID（如 `claude-code`），转发时直接作为远端请求的 `engineId`。

**ID 映射**：远端引擎 ID 已编码进本地 engineId，转发时解析即可，无需额外字段：

```
本地 engineId "remote-host01/claude-code"
  → parse_remote_engine_id → host_id="host01", target="claude-code"
  → 远端请求 options.engineId = "claude-code"
```

因此 `SessionMetadata` 只需增加一个字段 `remoteWorkspacePath`，`ChatRequestOptions` 只需增加 `remote_work_dir`（均见 §4.2 / §5.4）。不需要 `remoteTargetEngine`。

---

## 4. Rust 后端改动

### 4.1 新增 `commands/remote_engine.rs`

```rust
// 所有命令加 #[cfg(feature = "tauri-app")]（参照 memory: web-only-tauri-command-gate）

#[tauri::command]
pub async fn list_remote_engines() -> Result<Vec<RemoteEnginePublic>> { ... }

#[tauri::command]
pub async fn upsert_remote_engine(cfg: RemoteEnginePublic) -> Result<()> { ... }

#[tauri::command]
pub async fn delete_remote_engine(host_id: String) -> Result<> { ... }

/// 测试连接。接收 URL + token 而非 host_id，以便设置页在**保存前**用表单草稿测试。
/// token 为空表示不启用鉴权（远端未配置 token）。
#[tauri::command]
pub async fn test_remote_engine(
    url: String,
    token: Option<String>,
) -> Result<RemoteEngineHealth> { ... }

#[tauri::command]
pub async fn sync_remote_engine_metadata(host_id: String) -> Result<RemoteEngineSyncResult> { ... }

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEngineHealth {
    /// 远端 /api/health 可达（无鉴权，仅证明网络连通 + 服务存活）
    pub reachable: bool,
    /// 鉴权校验结果。reachable 但 auth_ok=false 表示 token 错误。
    pub auth_ok: bool,
    /// 远端引擎数（来自 /api/engine-metadata-list）
    pub engine_count: usize,
    /// 远端工作区数（来自 /api/settings 的 workspaces）
    pub workspace_count: usize,
    /// 远端各引擎版本摘要（如 "claude-code 2.x"），来自 HealthStatus
    pub engine_versions: Vec<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEngineSyncResult {
    pub engine_count: usize,
    pub workspace_count: usize,
    pub last_synced_at: i64,
}
```

**`test_remote_engine` 实现**（三步，**注意 `/api/health` 无鉴权**）：

1. `GET {url}/api/health`（**不带** Authorization，超时 5s）→ 仅证明网络连通 + 服务存活。
   返回的是 `HealthStatus`（`web/api/health.rs:15-19`，含 `claude_version` / `codex_version` / `pi_version`），**不含**引擎数/工作区数。
2. `GET {url}/api/settings` 带 `Authorization: Bearer <md5(token)>`（超时 5s）→ 这是**唯一能验证 token 的端点**（受 `api_auth` 中间件保护）。
   - 401/403 → `auth_ok: false`，`error: "token 无效"`
   - 成功 → `auth_ok: true`，从 `config.workspaces` 取 `workspace_count`
3. `POST {url}/api/engine-metadata-list`（同样带 Bearer）→ 取 `engine_count` 与 `engine_versions`

**为什么 health 不算鉴权**：`web/api/health.rs:13-14` 明确注释 `No auth required — this is a liveness + readiness probe`，且 `web/api/ws.rs` 的 `is_auth_skipped_path` 把 health 列入跳过鉴权的路径。因此「health 通」不能推出 token 正确，必须用受保护端点验证。

**为什么 test 接收 url+token 而非 host_id**：设置页「测试连接」按钮在表单保存前就要可点。若只接收 `host_id`，用户必须先保存再测，体验差且无法在首次添加时验证。保存后再次测试走同一函数（传已存配置）。

**`sync_remote_engine_metadata` 实现**：
1. `GET {url}/api/settings` → 取 `config.workspaces`
2. `POST {url}/api/engine-metadata-list`（需新增 IPC dispatch，见 §4.6）→ 取引擎元数据
3. 写入 `RemoteEngineConfig.workspaces` / `.engines` / `.last_synced_at` 并落盘
4. 返回 `RemoteEngineSyncResult { engine_count, workspace_count, last_synced_at }`

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEnginePublic {
    pub host_id: String,
    pub name: String,
    pub url: String,
    /// 仅创建/更新时传入；读取时不返回
    #[serde(default)]
    pub token: Option<String>,
    pub token_set: bool,
    pub enabled: bool,
    pub last_synced_at: i64,

    /// 远端引擎元数据缓存。未同步时为空数组（前端据此提示「请先同步」）。
    /// 前端 §5.1 getEngines / §5.2 engineMetadataStore 合并、§5.6 引擎选择器均依赖此字段。
    #[serde(default)]
    pub engines: Vec<EngineMetadata>,
    /// 远端工作区缓存。未同步时为空数组；为空时禁止创建远程会话（§11 第 2 项）。
    /// 前端 §5.1 getWorkspaces / §5.6 远端工作区选择器依赖此字段。
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
}
```

**为什么 DTO 要携带缓存而非另设查询命令**：引擎列表与工作区列表在选择器中是**同步读取**的（`getEngines(hostId)` 不走 `invoke`，直接读 store 内存）。若拆成独立命令 `get_remote_workspace_list(hostId)`，§5.6 的选择器切换引擎时要发起异步请求，UI 出现闪烁并引入加载态。合并在 DTO 内让 `remoteEngineStore` 一次 `load()` 全量可用。

代价：`list_remote_engines` 返回体积增大。量级可忽略（引擎数 ≤ 10，工作区数 ≤ 数十，元数据每项数百字节）。

**Token 处理**：读取时不返回 `token`（`Option` 在序列化前显式置 `None`），只返回 `token_set`。创建/更新时接收明文，加密落盘。

**`test_remote_engine`** 实现：
1. `GET {url}/api/health` 带 `Authorization: Bearer <md5(token)>`，超时 5s
2. 返回 `{ reachable, version, engineCount, workspaceCount }`

**`sync_remote_engine_metadata`** 实现：
1. `GET {url}/api/settings` → 取 `config.workspaces`
2. `POST {url}/api/engine-metadata-list`（需新增 IPC dispatch，见 §4.6）→ 取引擎元数据
3. 写入 `RemoteEngineConfig.workspaces` / `.engines` / `.last_synced_at` 并落盘
4. 返回 `{ engineCount, workspaceCount }`

**HTTP 客户端**：使用 `reqwest`（`Cargo.toml:91` 已依赖，features 含 `json`/`stream`/`rustls-tls`/`blocking`）。统一封装为 `RemoteEngineClient`：

```rust
pub struct RemoteEngineClient {
    http: reqwest::Client,
    base_url: String,
    token_md5: String,
}

impl RemoteEngineClient {
    pub fn new(host: &RemoteEngineConfig) -> Self { ... }

    fn auth_headers(&self) -> HeaderMap { ... }   // Bearer <md5>

    pub async fn health(&self) -> Result<HealthInfo> { ... }
    pub async fn get_settings(&self) -> Result<Config> { ... }
    pub async fn get_engine_metadata_list(&self) -> Result<Vec<EngineMetadata>> { ... }

    /// 转发聊天请求。返回远端生成的 session_id
    pub async fn send_chat(&self, req: &SendMessageRequest) -> Result<String> { ... }
    /// 转发中断
    pub async fn interrupt_chat(&self, session_id: &str, engine_id: &str) -> Result<()> { ... }
}
```

### 4.2 `ChatRequestOptions` 扩展

`src-tauri/src/commands/chat.rs:54-114`，**仅新增一个字段**：

```rust
/// 远端工作区绝对路径（remote-* 引擎模式下使用）。
/// 与 work_dir 互斥：remote-* 模式下 work_dir 应为 None，
/// 此字段值作为远端请求的 workDir 透传。
#[serde(default)]
pub remote_work_dir: Option<String>,
```

**不新增 `remote_target_engine` 字段**：远端目标引擎 ID 已编码进 `options.engine_id`（`remote-{hostId}/{engineId}`，见 §3.1），用 `parse_remote_engine_id` 解析即可。少一个字段 = 少一处前端/后端同步负担。

**不需要 `remote_session_id` 字段**：续聊的 session id 是 `continue_chat_inner` 的函数参数（`session_id`），不经过 options。远端侧同样如此（`SendMessageRequest.session_id`，`web/api/chat.rs:108`）。

**为什么独立于 `work_dir`**：
- 语义区分。`work_dir` 在本地有完整含义（MCP 配置生成、附件读取、`--add-dir`），混用会导致误触发本地文件操作。
- 校验隔离。`start_chat_inner` 的本地分支对 `work_dir` 有前置校验（路径存在性等），远端路径不应被这些校验拦截。

### 4.3 `start_chat_inner` / `continue_chat_inner` 分支

**插入点（精确）**：函数体最前面，紧跟开头的 `tracing::info` 日志之后、`process_attachments` 之前。

- `start_chat_inner`：插在 `chat.rs:1078`（日志结束）与 `chat.rs:1080`（`let processed =`）之间，返回类型 `Result<String>`
- `continue_chat_inner`：插在 `chat.rs:1615` 与 `chat.rs:1617` 之间，返回类型 `Result<()>`

**为什么插在最前面**：`process_attachments`（`chat.rs:1080-1083` / `:1617-1619`）以 `(&options.work_dir, &options.attachments)` 双 Some 为前提，在引擎解析（`:1118` / `:1637`）**之前**执行。远程模式必须跳过它，否则用远端路径去读本地文件。

**好消息**：由于远程模式 `work_dir` 保持 `None`（用独立的 `remote_work_dir` 字段），以下三处本地操作**天然跳过，无需显式处理**：

| 本地操作 | 位置 | 跳过条件 |
|---|---|---|
| 附件处理 `process_attachments` | `:1080-1083` / `:1617-1619` | `options.work_dir` 为 `None` |
| MCP 配置生成 `launcher::prepare_mcp_config` | `:1131-1157` | `work_dir.filter(!is_empty)` 为 `None` |
| MCP 注入 `inject_mcp_into_session_opts` | `:1224` | 无配置则注入空配置（无害） |

`build_message_with_attachments` 在附件为空时直接返回原文（`chat.rs:348-350`），已验证安全。

**仍需显式跳过的操作**（`work_dir` 为 `None` 不会自动跳过）：

| 本地操作 | 位置 | 必须跳过 |
|---|---|---|
| DSH 桥接预检查 | `:1648` 起 | 远程引擎 ID 不匹配 `dsh`，自动跳过 |
| 供应商分组路由 + failover 循环 | `:1278-1540` / `:1825+` | **远程分支在循环前 return，不会进入** |
| 图片附件传给引擎 | `:1248-1262` | 附件已跳过，`image_data` 为空 |
| Profile 应用 `apply_model_profile_options` | failover 循环内 | 远程分支不进入循环 |
| dsh 桥接健康检查 | `:1506-1508` | 循环内，不进入 |

**新增分支函数**：

```rust
/// 远程引擎模式：转发到远端服务，不执行任何本地文件操作。
/// 返回 Ok(session_id) 表示已处理（调用方直接 return）。
/// 注意：返回值是远端生成的 session_id，与本地引擎路径的语义一致
/// （前端存入 conversationId 后用于 continue_chat）。
async fn handle_remote_start_chat(
    options: &ChatRequestOptions,
    message: &str,
    state: &AppState,
    callbacks: &ChatCallbacks,
) -> Result<String> {
    let Some(engine_id) = options.engine_id.as_deref() else {
        return Err(AppError::ConfigError("远程引擎缺少 engine_id".to_string()));
    };
    // 引擎级 ID：remote-{hostId}/{engineId}（见 §3.1）
    let Some((host_id, remote_engine)) = parse_remote_engine_id(engine_id) else {
        unreachable!("caller guards this")
    };

    let Some(host) = read_remote_engine(host_id)? else {
        return Err(AppError::ConfigError(format!("远程引擎 {} 未配置", host_id)));
    };
    let client = RemoteEngineClient::new(host);

    let Some(remote_work_dir) = options.remote_work_dir.as_deref() else {
        return Err(AppError::ConfigError("远程引擎缺少远端工作区".to_string()));
    };

    // contextId 由前端在 chatOptions.contextId 中携带（值形如 "session-{本地sessionId}"，
    // 见 sessionStoreManager.ts:188 / createConversationStore.ts:1815）。
    // 用于事件过滤：远端同一机器上多个本地会话共用一条 WS，按 contextId 分流。
    let context_id = options
        .context_id
        .clone()
        .unwrap_or_else(|| "remote-unknown".to_string());

    // 构造远端请求 —— 仅透传"提示词 + 会话级偏好"
    let remote_opts = ChatRequestOptions {
        work_dir: Some(remote_work_dir.to_string()),
        engine_id: Some(remote_engine.to_string()),
        system_prompt: options.system_prompt.clone(),
        append_system_prompt: options.append_system_prompt.clone(),
        enable_mcp_tools: Some(true),   // 远端开启自己的 MCP，工具在远端执行
        context_id: Some(context_id.clone()),
        agent: options.agent.clone(),
        model: options.model.clone(),
        effort: options.effort.clone(),
        permission_mode: options.permission_mode.clone(),
        allowed_tools: options.allowed_tools.clone(),
        fork_session_id: options.fork_session_id.clone(),
        // 显式不传（依赖本地文件系统或本地供应商配置，远端不可解析）：
        //   work_dir / engine_id(远端用) / attachments / additional_dirs
        //   disabled_mcp_servers / model_profile_id / profile_mode / provider_group_id
        ..Default::default()
    };

    // 注册事件泵（per-contextId 单例，见 §4.4）。返回注册句柄，
    // 由调用方在 start_chat 返回前 drop 或持有，session_end 后自动释放。
    let pump_handle = register_remote_pump(
        state,
        context_id,
        client,
        callbacks.emit_event.clone(),
        callbacks.notify_complete.clone(),
    ).await?;

    // 远端 SendMessageRequest.session_id 为 None → 创建新会话（见 web/api/chat.rs:106-111）
    let req = SendMessageRequest {
        message: message.to_string(),
        session_id: None,
        options: Some(remote_opts),
    };
    let remote_session_id = client
        .send_chat(&req)
        .await
        .map_err(|e| AppError::NetworkError(format!("远端请求失败: {}", e)))?;

    drop(pump_handle);   // 释放注册引用；泵本体由 session_end 驱动退出
    Ok(remote_session_id)
}

/// 续聊转发。远端 SendMessageRequest.session_id 为 Some → 继续会话。
async fn handle_remote_continue_chat(
    session_id: &str,
    options: &ChatRequestOptions,
    message: &str,
    state: &AppState,
    callbacks: &ChatCallbacks,
) -> Result<()> {
    // 与 handle_remote_start_chat 共享校验与泵注册逻辑，
    // 建议抽为 prepare_remote_forward(...) -> Result<(client, remote_opts, context_id)>，
    // 两个函数各自构造 SendMessageRequest（仅 session_id 字段不同）并调用 client.send_chat。
    todo!()
}
```

**为什么单个 `send_chat` 方法足够**：远端 `POST /api/chat/send` 的 `SendMessageRequest` 结构为 `{ message, session_id: Option<String>, options }`（`web/api/chat.rs:106-111`）——`session_id` 为空则 `start_chat_inner`，非空则 `continue_chat_inner`（`handle_send_message` 见 `:114+`）。start/continue 在远端是同一入口，本地客户端无需拆分。

**调用点**：

```rust
// chat.rs:1078 之后插入
if options.engine_id.as_deref().map(|s| s.starts_with("remote-")).unwrap_or(false) {
    return handle_remote_start_chat(&options, &message, state, &callbacks).await;
}

// chat.rs:1615 之后插入
if options.engine_id.as_deref().map(|s| s.starts_with("remote-")).unwrap_or(false) {
    return handle_remote_continue_chat(&session_id, &options, &message, state, &callbacks).await;
}
```

**为什么独立于 `work_dir` 字段**：
- 语义区分。`work_dir` 在本地有完整含义（MCP 配置生成、附件读取、`--add-dir`），混用会导致误触发本地文件操作。
- 校验隔离。`start_chat_inner` 的本地分支对 `work_dir` 有前置校验（路径存在性等），远端路径不应被这些校验拦截。

**关键细节 — 本地 conversationId 与远端 session id**

远端返回的 `sessionId` 是远端机器上的会话 ID。本地 `start_chat` 的返回值被 `createConversationStore.ts:1845` 存入 `conversationId`，后续 `continue_chat` 用它。

**决策：本地直接使用远端返回的 session id**，不额外维护映射表。理由：
- `continue_chat_inner` 的续聊路径已支持按 `engine_id` 解析（`chat.rs:1637-1641`），远端 ID 原样回传即可继续转发
- 远端 `--resume` 由远端自己管理，本地无需理解其格式（Claude CLI 的 `--resume` 见 `claude.rs:467,590`）
- 减少一层映射的失效风险

**appendSystemPrompt 的来源（需注意）**

前端 `buildWorkspacePrompts`（`conversationStoreUtils.ts:209-231`）读取**本地**工作区生成 prompt，包含本地路径。远程模式下：
- 若会话未绑定本地工作区（`workspaceId: null`），`buildWorkspacePrompts` 返回空字符串，远端 AI 无工作区上下文提示
- 远端 AI 仍会通过 `workDir` 获得正确 cwd，功能不受影响，但缺少"正在 {name} 工作区工作 / 项目路径"的提示

**MVP 处理**：前端在远程模式下用远端工作区条目（`RemoteEngineConfig.workspaces[]` 中的 `name` + `path`）构造 `appendSystemPrompt`，复用 `i18n.t('systemPrompt:workingIn')` 等现有文案。实现位置：`createConversationStore.ts:1795+` 的 `buildWorkspacePrompts` 调用处，按 `engine.startsWith('remote-')` 分流。

### 4.4 远端事件泵（per-contextId 单例）

新文件 `src-tauri/src/services/remote_event_pump.rs`。

```rust
/// 订阅远端 WebSocket，将匹配 contextId 的 chat-event 转发到本地 callbacks。
pub struct RemoteEventPump {
    client: RemoteEngineClient,
    context_id: String,
    emit_event: Arc<dyn Fn(serde_json::Value) + Send + Sync>,
    notify_complete: Arc<dyn Fn() + Send + Sync>,
}

/// 全局泵注册表：context_id -> 泵实例。
/// AppState 新增字段 `pub remote_pumps: Arc<Mutex<HashMap<String, Arc<RemoteEventPump>>>>`
pub struct RemotePumpRegistry { ... }

impl RemotePumpRegistry {
    /// 注册（或复用）一个 contextId 的泵。已存在则直接返回现有句柄。
    pub async fn register(
        &self,
        context_id: String,
        client: RemoteEngineClient,
        emit_event: Arc<dyn Fn(serde_json::Value) + Send + Sync>,
        notify_complete: Arc<dyn Fn() + Send + Sync>,
    ) -> Result<Arc<RemoteEventPump>> { ... }
}
```

**为什么必须是 per-contextId 单例**：远端事件按 `contextId` 标记会话。若每轮 `start_chat` / `continue_chat` 都新建一个泵，同一 contextId 上会有 N 个泵同时订阅 WS，**每条事件被转发 N 次**，前端消息重复渲染。

因此泵的粒度是 **contextId（= 本地会话）**，而非请求。同一会话的多轮对话复用同一个泵，`session_end` 后延迟释放。

**连接**：`GET {base_url}/api/ws?token={md5}`（`ws.rs:19-21` 确认 token 走 query param，浏览器 WS 不支持自定义 header）。

**消息处理**：

```
远端帧: {"event":"chat-event","payload":{"contextId":"session-<本地id>","payload":<ai_event>}}
```

由 `chat.rs:1176-1188` 的 `dual_emit` 确认。本地处理：
1. 解析 `event` 字段，仅处理 `"chat-event"`
2. 解析 `payload.contextId`，与 `context_id` 比对，不匹配则丢弃
3. 原样调用 `emit_event(envelope)`（**不做任何改写**）
4. 若 `payload.payload.type == "session_end"`：调用 `notify_complete()`（对齐 `start_chat_inner` 中 `chat.rs:1194-1196` 的行为），并延迟 5s 释放本泵

**为什么原样转发**：本地 `eventRouter.ts:93-101` 期望的就是 `{contextId, payload}` 结构，且 `contextId = "session-{frontendSessionId}"` 已满足路由条件（`eventRouter.ts:48-49` 提取 `sessionId` 后按 store 路由）。

**两个 callback 都需传递**：`ChatCallbacks` 有两个字段（`chat.rs:391-396`）—— `emit_event` 转发事件，`notify_complete` 在 `session_end` 时触发桌面通知。漏传 `notify_complete` 会导致远端会话完成时本地不弹通知。

**生命周期**：
- 首条 `start_chat` 注册泵；后续 `continue_chat` 复用
- 收到 `session_end` 后延迟 5s 退出（对齐 `tauri-command-engine.ts:29-36` 的 session_end 清理时序，给尾随事件留窗口）
- 断线时有限重试（3 次，指数退避 1/2/4s），超出则向上报错
- **不需要 resume 协议**：MVP 阶段断线重连后事件丢失可接受，前端有 `webReconnectResync` 兜底（拉历史校正）
- 应用退出时 `AppState` drop 自动清理

**并发隔离**：不同 contextId 各自独立泵；同一 contextId 共享一个泵。同一远端机器上的泵通过各自独立的 WS 连接订阅（而非共享一条按 contextId 分流），实现简单，单机场景连接数可接受（≤ 数个并发会话）。

**远端订阅优化（可选）**：远端 WS 支持 per-connection `subscribe` 指令（`ws.rs:29-32`，`{"type":"subscribe","events":["chat-event"]}`），且订阅按 event name 而非 contextId 过滤。因此每个泵仍会收到该远端所有会话的事件，靠本地 `contextId` 比对过滤。这是可接受的（远端单机事件量有限），但若远端同时跑多个高并发会话，可考虑远端增加按 contextId 的订阅过滤（Phase 2）。

### 4.5 中断转发（**必需，非可选**）

`interrupt_chat_inner` 的分发路径与 `start/continue_chat_inner` **不对称**：

```rust
// chat.rs:1927-1928
let engine = engine_id.as_ref().map(|id| EngineId::parse_any(id));
let mut registry = state.engine_registry.lock().await;

// chat.rs:1939-1960：按 engine 路由，失败则 try_interrupt_all 兜底，再失败则报错
if let Some(engine) = engine {
    match registry.interrupt(&engine, &session_id) { ... }
```

本地 `engine_registry` 只注册了本地引擎，**不含 `remote-*`**，因此：
- `registry.interrupt(&EngineId::Custom("remote-xxx"), ...)` → `None`，返回 Err
- 兜底 `registry.try_interrupt_all(&session_id)` → 遍历本地引擎均无此 session → `false`
- 最终 `Err("未找到会话 ...")`，前端 `interrupt` 捕获后走 `createConversationStore.ts:1895+` 的降级（清 isStreaming + toast "中断失败"）

**用户可见后果**：远程会话点中断会弹"中断失败"，但远端 AI 进程仍在跑。这是不可接受的。

**修正**：远程分支插在 `chat.rs:1927` 解析 engine 之前：

```rust
pub async fn interrupt_chat_inner(
    session_id: String,
    engine_id: Option<String>,
    state: &crate::AppState,
) -> Result<()> {
    // 远程引擎：直接转发中断到远端，不查本地 registry
    if let Some(id) = engine_id.as_deref().filter(|s| s.starts_with("remote-")) {
        let host_id = id.strip_prefix("remote-").unwrap();
        let Some(host) = read_remote_engine(host_id)? else {
            return Err(AppError::ConfigError(format!("远程引擎 {} 未配置", host_id)));
        };
        let client = RemoteEngineClient::new(host);
        return client.interrupt_chat(&session_id, None).await;
    }

    let engine = engine_id.as_ref().map(|id| EngineId::parse_any(id));
    // ... 原逻辑不变
}
```

**关键简化 — 中断不需要传目标引擎 ID**

远端 `InterruptRequest` 的 `engine_id` 是 `Option<String>`（`web/api/chat.rs:202-205`），且 `validate_engine`（`web/api/session.rs:17-28`）只透传不校验。省略该字段时，远端 `interrupt_chat_inner` 走 `try_interrupt_all` 分支，遍历所有已注册引擎按 `session_id` 定位会话。

因此：
- **不需要** `remoteTargetEngine`（比 start/continue 少一个必填字段）
- **不需要**扩展 `interrupt_chat` Tauri 命令签名（保持 `{ sessionId, engineId }`，`chat.rs:2067-2073`）
- 前端 `createConversationStore.ts:1881` 的调用点**零改动**

**正确性**：`try_interrupt_all` 按 session_id 遍历，远端 session id 是远端生成的 UUID（§4.3），跨引擎碰撞概率可忽略。若日后需要严格路由，可让前端在 `interrupt_chat` 中附加 `remoteTargetEngine`（需扩展命令签名），列为 Phase 2。

**事件泵**：中断不需要单独泵。远端收到中断后自己发 `session_end`，该事件经 §4.4 已注册的泵回流（泵在首次 `start_chat` 时建立，`session_end` 后延迟 5s 退出，时序覆盖中断场景）。

**Web 端对齐**：远端 `POST /api/chat/interrupt`（`web/api/chat.rs:208-215`）已存在，`engineId` 可选。本地 `RemoteEngineClient::interrupt_chat(session_id, None)` 直接调用，**零远端改动**。

### 4.6 IPC Bridge 补充

`src-tauri/src/web/api/ipc.rs` catch-all 处（`:464`）新增 dispatch，使远端可被本地查询引擎元数据：

```rust
// match arm（参照 :399 / :403 的既有 async dispatch 写法）
"get_engine_metadata_list" => dispatch_get_engine_metadata_list(&state).await,

/// 远端被本地查询时返回其引擎元数据列表。
/// async 是因为 engine_registry 是 tokio::sync::Mutex（state.rs:245），
/// 必须 .await 获取锁，不能用 blocking_lock（tokio Mutex 无此方法）。
async fn dispatch_get_engine_metadata_list(state: &AppState) -> Result<Json<Value>, WebError> {
    let registry = state.engine_registry.lock().await;
    let metas = registry.list_all_metadata();
    Ok(Json(serde_json::to_value(metas).unwrap_or_default()))
}
```

**为什么必须 async**：`state.engine_registry` 是 `Arc<AsyncMutex<EngineRegistry>>`（`state.rs:245`），`AsyncMutex` 无 `blocking_lock`。且 `handle_ipc_bridge` 本身是 `async fn`（`ipc.rs:44-46`），在 tokio 多线程运行时上对 `std::sync::Mutex` 用阻塞锁会占住 worker 线程；对 `tokio::sync::Mutex` 用 `blocking_lock` 则会直接死锁（该锁只能 `.await` 获取）。既有先例：`dispatch_get_web_server_status`（`ipc.rs:2717`）、`dispatch_register_plugin_engine`（`:422`）均为此模式。

**`handle_ipc_bridge` 的 dispatch arm 是同步 match**：`handle_ipc_bridge` 为 `async fn`，match arm 内可用 `.await`（见 `ipc.rs:344,399,403,422` 等多处既有 async dispatch）。因此新增 arm 加 `.await` 即可，无需改 match 结构。

前端请求路径：`POST {url}/api/get-engine-metadata-list`（IPC bridge 的 kebab→snake 转换，`ipc.rs:49`）。

**补充**：为支持 §7.4 的 Web 端（移动端 / 浏览器）管理远程引擎，以下命令也需在 IPC bridge 注册（否则 HTTP 模式下设置页无法使用）：

```rust
"list_remote_engines"      => dispatch_list_remote_engines().await,
"upsert_remote_engine"     => dispatch_upsert_remote_engine(&args).await,
"delete_remote_engine"     => dispatch_delete_remote_engine(&args).await,
"test_remote_engine"       => dispatch_test_remote_engine(&args).await,
"sync_remote_engine_metadata" => dispatch_sync_remote_engine_metadata(&args).await,
```

MVP 可只做桌面端管理（§11 第 3 项），但注册成本极低，建议一并完成。

---

## 5. 前端改动

### 5.1 `RemoteEngineStore`

新文件 `src/stores/remoteEngineStore.ts`：

```typescript
interface RemoteEngineState {
  hosts: RemoteEnginePublic[]
  loaded: boolean
  loading: boolean
  error: string | null

  load: () => Promise<void>
  upsert: (cfg: RemoteEnginePublic) => Promise<void>
  remove: (hostId: string) => Promise<void>
  test: (hostId: string) => Promise<RemoteEngineHealth>
  sync: (hostId: string) => Promise<RemoteEngineSyncResult>

  /** 按 engineId 反查 host 配置 */
  getHostByEngineId: (engineId: string) => RemoteEnginePublic | undefined
  /** 远端工作区列表 */
  getWorkspaces: (hostId: string) => WorkspaceEntry[]
  /** 远端引擎元数据列表 */
  getEngines: (hostId: string) => EngineMetadata[]
}
```

**不持久化**（`persist` 中间件不使用）：后端 `remote-engines.json` 为唯一真相源，与 `workspaceStore` 同模式（`workspaceStore.ts:1-7` 注释：服务端 Config 为唯一真相源）。

### 5.2 `engineMetadataStore` 合并

`src/stores/engineMetadataStore.ts` 的 `load()` 修改为合并本地 + 远端缓存：

```typescript
load: async () => {
  // ...现有逻辑：invoke('get_engine_metadata_list')
  const localMetas = await invoke<EngineMetadata[]>('get_engine_metadata_list')

  // 合并远端引擎（新增）
  const remoteHosts = useRemoteEngineStore.getState().hosts
  const remoteMetas: EngineMetadata[] = []
  for (const host of remoteHosts) {
    if (!host.enabled) continue
    for (const e of host.engines ?? []) {
      remoteMetas.push({
        ...e,
        // ID 编码为 remote-{hostId}/{engineId}，name 追加来源标记
        id: `remote-${host.hostId}/${e.id}` as EngineId,
        name: `${e.name} (${host.name})`,
        description: `远程引擎 · ${host.url}`,
      })
    }
  }

  set({ metadatas: [...localMetas, ...remoteMetas], loaded: true })
}
```

**字段命名对齐**：Rust 侧 `host_id` → 经 `#[serde(rename_all = "camelCase")]` 序列化为 `hostId`，前端 DTO 用 `hostId`（§4.1 `RemoteEnginePublic`）。§5.6 选择器据此构造 ID：`remote-${host.hostId}/${e.id}`。

**注意**：`EngineMetadata.id` 类型为 `EngineId`（开放字符串 `src/types/config.ts:11`），`remote-{hostId}/{engineId}` 合法。

### 5.3 `normalizeEngineId` 放行

`src/utils/engineDisplay.ts:17-26`：

```typescript
export function normalizeEngineId(engineId?: string | null): EngineId {
  if (!engineId) return 'claude-code'
  // remote-* 前缀直接放行（避免未加载时降级，见 load-bearing 说明）
  if (engineId.startsWith('remote-')) return engineId as EngineId
  const metadatas = useEngineMetadataStore.getState().metadatas
  if (metadatas.length === 0) {
    const fallback: EngineId[] = ['claude-code', 'codex', 'pi', 'simple-ai']
    return (fallback as string[]).includes(engineId) ? (engineId as EngineId) : 'claude-code'
  }
  return metadatas.some(m => m.id === engineId) ? (engineId as EngineId) : 'claude-code'
}
```

**这是关键修复点**：若不改动，`sessionStoreManager.ts:168` 的 `normalizeEngineId(options.engineId || configEngineId)` 会把 `remote-*` 降级为 `claude-code`，用户选择远程引擎会被静默丢弃。

### 5.4 `SessionMetadata` 扩展

`src/stores/conversationStore/types.ts:663-683` 新增**一个**字段：

```typescript
export interface SessionMetadata {
  // ...现有字段
  /** 远程引擎模式下：远端工作区绝对路径 */
  remoteWorkspacePath?: string
}
```

**不新增 `remoteTargetEngine`**：远端目标引擎 ID 已编码进 `engineId`（`remote-{hostId}/{engineId}`，见 §3.1），由 Rust 侧 `parse_remote_engine_id` 解析，前端无需重复存储。

`CreateSessionOptions`（`types.ts:797` 附近）同步新增。`sessionStoreManager.createSession`（`:164-183`）写入 metadata：

```typescript
const metadata: SessionMetadata = {
  // ...现有
  remoteWorkspacePath: options.remoteWorkspacePath,
}
```

**注意**：`engineId` 字段本身已存在（`types.ts:663-683`），无需改动 —— 它承载的 `remote-*` 值会经 §5.3 的 `normalizeEngineId` 放行。

### 5.5 `sendMessage` 透传

`src/stores/conversationStore/createConversationStore.ts:1811-1851`。在 `chatOptions` 构造处增加：

```typescript
const sessionMeta = sessionStoreManager.getState().sessionMetadata.get(sessionId)
// 远程引擎模式：附加远端工作区（目标引擎已含在 engineId 中）
const isRemoteEngine = engine.startsWith('remote-')

const chatOptions = {
  // ...现有字段
  ...(isRemoteEngine ? {
    remoteWorkDir: sessionMeta?.remoteWorkspacePath,
  } : {}),
}
```

**注意**：
- `continueChat`（`:1972`）需附加同 `sendMessage`（同为 `ChatRequestOptions`）。
- `interrupt`（`:1881`）**零改动**：只传 `{ sessionId, engineId }`，`engineId` 已是 `remote-*`，Rust 侧按前缀分流（§4.5）。
- 前端**无需**为远程模式构造 `engineId` 的任何额外变体 —— `sessionMeta.engineId` 原样透传。

**MCP 禁用**：`chatOptions.enableMcpTools` 在远程模式下强制 `true`（由远端决定），本地 `getDisabledPluginMcpServers()` 不传。

**附件禁用**：选远程引擎时隐藏附件按钮（§8 风险表），因为 `attachments` 不在透传字段中。

### 5.6 `NewSessionButton` 远程分组 + 远端工作区选择器

`src/components/Chat/session/NewSessionButton.tsx`。当前结构：引擎选择区（`:207-227`）+ 工作区选择区（主工作区 + 关联）。

**改动**：
1. 引擎列表分组：`本地引擎` / `远程引擎`（后者来自 `useRemoteEngineStore.hosts.flatMap(h => h.engines.map(...))`，ID 为 `remote-{hostId}/{engineId}`，见 §3.1）
2. 选中远程引擎后，工作区列表切换为远端工作区（`useRemoteEngineStore.getWorkspaces(hostId)`），标注为远端
3. 选中远程工作区时，提示"该工作区在远端 {host.name} 上"
4. 创建时传 `remoteWorkspacePath`（目标引擎已含在 `engineId` 中，见 §5.4）

**远端工作区与所选引擎的联动**：切换远程引擎（同一 host 下不同 engine）时，工作区列表不变（工作区属于 host，与 engine 无关）；但 `engineId` 会变为 `remote-{hostId}/{engineId}`，因此 `createSession` 的 `engineId` 随之更新。

**UI 细节**：
- 远程工作区项左侧加远端图标（区分本机工作区）
- 远端工作区**不支持关联工作区**（`contextWorkspaceIds`）：远端 `--add-dir` 语义需另行设计，MVP 禁用
- 无远端工作区时显示"请先同步远端引擎元数据"，附同步按钮

### 5.7 设置页 `RemoteEnginesTab`

新文件 `src/components/Settings/tabs/RemoteEnginesTab.tsx`，挂载点 `src/components/Settings/SettingsPage.tsx`（参照 `AIEngineTab` 的挂载方式）。

功能：
- 列表：远端引擎主机（name / url / 引擎数 / 工作区数 / 最后同步时间 / 启用开关）
- 新建/编辑表单：name / url / token（密码框，编辑时为空表示不修改）
- 操作：测试连接 / 同步元数据 / 删除
- 连接状态徽章：实时显示 `test` 结果（可达/不可达/鉴权失败）

**Token 处理**：创建/编辑时明文提交，后端加密落盘。读取时只返回 `tokenSet: boolean`，UI 显示 `••••••` 或"未设置"。

### 5.8 `CreateSessionModal` / `AIPopover` / `SessionConfigSelector` 同步

- `CreateSessionModal.tsx:195-220`：同 `NewSessionButton` 的远程引擎 + 远端工作区逻辑（抽为共享 hook `useRemoteEnginePicker`，避免重复）
- `AIPopover.tsx:128-138`（会话内切换引擎）：远程引擎出现在列表中，但 `canSwitchEngine` 约束不变（会话无内容才可切换）
- `SessionConfigSelector.tsx:126-148`：`currentEngine` 为 `remote-*` 时隐藏 agent/effort 选择器（远端引擎的能力矩阵未知，MVP 不暴露），仅显示 model（若远端引擎支持）

### 5.9 i18n

`src/locales/zh-CN/settings.json` 新增 `remoteEngines` 段；`src/locales/en-US/settings.json` 同步。`chat.json` 的 `newSession` 段新增 `remoteWorkspace` / `syncRemoteHint` / `remoteEngineGroup`。

---

## 6. 实施顺序

```
P0  Rust 基础设施
  ├─ 6.1  models/remote_engine.rs（结构 + 加密 + 持久化 + parse_remote_engine_id）  [0.5 天]
  ├─ 6.2  commands/remote_engine.rs（CRUD + test + sync）          [1 天]
  │       └─ 依赖 services/remote_engine_client.rs（HTTP 封装）
  ├─ 6.3  web/api/ipc.rs 补 dispatch_get_engine_metadata_list      [0.5 天]
  │       └─ 必须 async fn + .lock().await（§4.6，tokio Mutex 无 blocking_lock）
  └─ 6.4  lib.rs 注册命令                                          [0.5 天]

P1  转发核心（MVP 关键路径）
  ├─ 6.5  ChatRequestOptions 加 remote_work_dir（仅此一个字段）
  ├─ 6.6  services/remote_event_pump.rs（WS 订阅 + contextId 过滤 + 转发）
  │       └─ 必须 per-contextId 单例，否则同一会话多轮对话事件重复（§4.4 / §8）
  ├─ 6.7  chat.rs start_chat_inner 远程分支（插入点 :1078 之后、:1080 之前）
  ├─ 6.8  chat.rs continue_chat_inner 远程分支（插入点 :1615 之后、:1617 之前）
  └─ 6.9  chat.rs interrupt_chat_inner 远程分支（插入点 :1927 之前，不查 registry）   [2 天]

P2  前端数据层
  ├─ 6.10 remoteEngineStore.ts                                    [0.5 天]
  ├─ 6.11 engineMetadataStore 合并远端缓存
  ├─ 6.12 normalizeEngineId 放行 remote-*                         [0.5 天]
  │       └─ 不改则 sessionStoreManager.ts:168 把 remote-* 降级为 claude-code（§5.3）
  └─ 6.13 SessionMetadata 加 remoteWorkspacePath（仅一个字段）

P3  前端 UI
  ├─ 6.14 useRemoteEnginePicker hook（共享 picker 逻辑）
  ├─ 6.15 NewSessionButton 远程分组 + 远端工作区                   [1.5 天]
  ├─ 6.16 CreateSessionModal 同步
  ├─ 6.17 AIPopover / SessionConfigSelector 适配
  └─ 6.18 SettingsPage 挂载 RemoteEnginesTab                      [1 天]

P4  收尾
  ├─ 6.19 i18n（zh-CN + en-US）
  ├─ 6.20 测试（见 §7）
  └─ 6.21 文档（README 使用说明）                                  [1 天]

总计约 10 人日
```

---

## 7. 测试策略

### 7.1 Rust 单元测试

- `remote_engine.rs`：加密/解密往返、`engine_id_of()` 派生（含同 host 双引擎 → 两个不同 ID，回归 §8 的重复项风险）、`parse_remote_engine_id` 往返（合法 / 无前缀 / 无 `/` 三段）、`base_url()` 协议补齐（有/无 `http://`）、原子写
- `remote_engine_client.rs`：mock server（`axum::Router` + `wiremock` 或本地起 axum）验证 health/settings/send_chat 的 header（Bearer md5）与 body；`send_chat` 的 `session_id` 为 `None` 与 `Some` 两路径
- `remote_event_pump.rs`：mock WS server 验证 contextId 过滤（匹配/不匹配/空 contextId）、`session_end` 后延迟退出、断线重试次数上限；**单例回归**：同一 contextId 注册两次必须复用同一泵实例（否则事件重复投递，§8 高风险项）
- `chat.rs` 远程分支：用 mock `RemoteEngineClient` 验证「不调用本地 MCP 配置生成 / 附件读取 / 工作区 prompt / 供应商 failover」（**关键回归**）；并验证 `remote_*` 的 `work_dir` 为 `None` 时本地路径完全跳过
- `interrupt_chat_inner`：验证 `remote-*` 分支在 `engine_registry` 查询**之前**返回（不查 registry），本地引擎路径行为不变

### 7.2 前端测试

- `normalizeEngineId`：`remote-*` 不降级、未知 ID 仍降级、元数据未加载时行为
- `remoteEngineStore`：CRUD 往返、合并到 `engineMetadataStore` 后 `metadatas` 包含 `remote-*`
- `NewSessionButton`：远程引擎选中后工作区列表切换、创建时传 `remoteWorkspacePath`

### 7.3 集成验证（手工）

```
1. 机器 A 启动 Polaris，开启 Web 服务（Settings > Web），记 IP:9830 + token
2. 机器 B 启动 Polaris，Settings > 远程引擎 > 新建（填 A 的 IP:9830 + token）
3. 测试连接 → 应显示可达 + 引擎数 + 工作区数
4. 同步元数据 → 引擎列表与工作区列表填充
5. 新建会话 → 选 remote-<A的hostId>/<引擎如 claude-code> → 选远端工作区
6. 发一条消息 → AI 应在机器 A 上执行，回复经 WS 回流
7. 验证：机器 A 的日志出现 start_chat 记录；机器 B 不产生任何本地 AI 进程
8. 中断 → 远端进程终止
9. 续聊 → 走 continue_chat 转发
```

### 7.4 关键回归

- 本地引擎路径完全不受影响（`engineId` 不以 `remote-` 开头时走原路径）
- Web 端（移动端 / 浏览器）不受影响（`remoteEngineStore` 在无 Tauri 环境下 `invoke` 走 IPC bridge，需确认命令已在 bridge 注册，否则降级为空列表）

---

## 8. 风险与边界

| 风险 | 影响 | 缓解 |
|---|---|---|
| **contextId 碰撞**：同一远端机器上两个本地会话若 contextId 相同，事件会串线 | 高 | contextId 取本地 store sessionId（UUID），碰撞概率可忽略。但仍应显式校验：远端返回的 contextId 与请求时传入的不一致则丢弃 |
| **远端会话 ID 语义**：本地 `conversationId` 存的是远端 ID，若远端重置/清理，本地会话变成孤儿 | 中 | MVP 接受。后续可加"远端会话存活探测"（`/api/chat/history/{id}` 404 时提示） |
| **WS 断线丢事件**：远端 WS 断开期间的事件丢失，前端流式状态卡住 | 中 | MVP 接受（前端 `webReconnectResync` 兜底拉历史）。文档标注为已知限制 |
| **MCP 能力不对齐**：远端 MCP 工具集与本地不同，AI 的工具调用结果可能引用本地不可见的文件 | 中 | 设计使然（纯远端语义）。UI 在选远程工作区时明确提示"AI 将在远端执行" |
| **token 明文经 Tauri 命令传输**：前端表单 → `invoke('upsert_remote_engine')` 明文 | 低 | Tauri IPC 为本地进程间通信，不经过网络。落盘即加密 |
| **远端 Web 服务未开启**：用户填了地址但远端 Web 服务没开 | 低 | `test_remote_engine` 明确报错"远端 Web 服务未启用"，设置页有引导 |
| **`normalizeEngineId` 改动影响面**：所有引擎 ID 消费点都过这个函数 | 中 | 仅新增 `remote-` 前缀放行分支，不改动既有逻辑。需回归本地引擎选择器 |
| **本地事件泵与本地引擎的事件混淆**：同一 contextId 下既有本地事件又有远端转发事件 | 低 | 不会发生。contextId 是 `session-{sessionId}`，本地 store 的 sessionId 与远端转发的事件一一对应 |
| **附件不支持**：远程模式下 `attachments` 不传，前端上传的图片/文件丢失 | 中 | MVP 明确禁用：选远程引擎时隐藏附件按钮。文档标注 |
| **事件泵重复投递**：若按"每请求一个泵"实现，同一 contextId 上多个泵同时订阅 WS，每条事件被转发 N 次 | 高 | **必须实现为 per-contextId 单例**（§4.4），同一会话多轮对话复用同一泵。这是 §7.1 必测项 |
| **中断静默失败**：`interrupt_chat_inner` 走 `engine_registry`，本地无 `remote-*` 引擎，两条路径都失败，用户看到"中断失败"但远端 AI 仍在跑 | 高 | 远程分支必须插在 `chat.rs:1927` 解析 engine **之前**（§4.5），否则中断不生效 |
| **远端多引擎选择器重复项**：远端一台机器跑 4+ 个引擎（`traits.rs:114-121`），若引擎 ID 只编码 `remote-{hostId}`，picker 中同一 host 的多个引擎 ID 重复 | 中 | ID 编码为 `remote-{hostId}/{engineId}`（§3.1），host 与目标引擎均从 ID 解析，无重复 |
| **IPC bridge 锁死锁**：`state.engine_registry` 是 `tokio::sync::Mutex`（`state.rs:245`），无 `blocking_lock`；`handle_ipc_bridge` 是 async | 中 | §4.6 必须用 `async fn` + `.lock().await`，参照 `dispatch_get_web_server_status`（`ipc.rs:2717`）。用 `blocking_lock()` 会直接编译失败 |
| **appendSystemPrompt 空**：远端会话未绑定本地工作区时 `buildWorkspacePrompts` 返回空串，AI 缺"项目路径"提示 | 低 | 功能不受影响（`workDir` 已传正确 cwd）。前端按 `remote-*` 分流，用远端工作区条目构造 prompt（§4.3） |

### 8.1 已验证的前提（实施时不必重新论证）

| 结论 | 证据 |
|---|---|
| `ChatRequestOptions` 派生 `Default`，可 `..Default::default()` 构造 | `chat.rs:52` |
| `EnvKeyMapping` 只存环境变量**名**，无明文密钥，远端元数据缓存无泄漏面 | `traits.rs:872-876` |
| `contextId = "session-${sessionId}"` 由前端携带 | `sessionStoreManager.ts:188`、`createConversationStore.ts:1815` |
| 远端 `SendMessageRequest.session_id: Option` 单方法覆盖 start/continue | `web/api/chat.rs:106-111` |
| 远端 `InterruptRequest.engine_id: Option`，省略走 `try_interrupt_all` | `web/api/chat.rs:202-205` |
| `EngineId::parse_any("remote-x")` 落到 `Custom`，不破坏既有 `Custom` 精确匹配 | `traits.rs:98-100`；`chat.rs:1308` |
| 远端 WS token 走 query param（浏览器 WS 不支持自定义 header） | `web/api/ws.rs:19-21` |
| 本地 `EventBroadcaster` 带 `seq` + 重放缓冲，但远程泵**不需要** resume 协议 | `web/event_broadcaster.rs:20-30` |

---

## 9. 不做的（明确排除）

- **本地工具代理到远端**（Phase 2）：工具调用跨端回流 + 审批，需要新的双向协议，不在 MVP
- **远端工作区本地编辑**：MVP 只读远端 `config.workspaces`，不在本地编辑远端工作区列表
- **多远端并行**：一个会话只能选一个远端引擎（不支持本地 + 远端混合）
- **远端工作区关联（`--add-dir`）**：远端 `additionalDirs` 语义需另行设计
- **审计 / `source: local|remote` 权限标记**：对齐 `plans/new-app-architecture-v1.md` 的 Phase 3（ARC Relay）
- **Relay 插件化**：远期架构，不在本次范围
- **远端 fork/resume 会话列表**：本地历史面板不显示远端历史会话
- **远端引擎热插拔**：远端新增引擎需手动点"同步"，不做轮询

---

## 10. 与既有架构的关系

| 既有机制 | 本方案复用方式 |
|---|---|
| 远端 Web 服务 `src-tauri/src/web/` | 直接作为远程引擎服务端，零改动（仅补 1 个 IPC dispatch） |
| `httpTransport`（`src/services/transport/`） | **不复用**（前端不直连远端，见 §2.1） |
| `EngineId::Custom(String)` | 承载 `remote-{hostId}/{engineId}`，核心枚举零改动 |
| `SessionOptions.work_dir` | 远端请求的 `workDir`，字段链路不变 |
| `EventBroadcaster` + `dual_emit` | 事件泵的本地输出端，直接调用 `callbacks.emit_event` |
| `eventRouter`（`src/services/eventRouter.ts`） | 零改动，`contextId` 路由天然适配 |
| `engineMetadataStore`（后端为真相源） | 扩展为本地 + 远端缓存合并 |
| `mobile_config.rs` 模式 | 持久化 + 原子写模板 |
| `personal_hub_crypto.rs` | AES-128-CBC token 加密模板 |
| `dsh.rs`（HTTP + WS 双通道引擎） | 事件泵的实现参考（WS 重连 + 帧解析） |
| `plugin_service_manager.rs` | **不复用**（那是托管远端进程，本方案是消费远端服务） |

---

## 11. 待确认项

1. **加密密钥来源**（**实施前必须定案**）：
   `config.personal_hub.encryption_key` 默认为 `String::new()`（`config.rs:182`）。复用它的风险：用户从未配置 Personal Hub 时，口令为空串 —— 本地文件加密退化为「仅防肉眼读取」。
   **建议定案**：在 `config.interaction`（或同级新增 `remote_engine`）下新增独立 `cipher_key: String`，首次创建远程引擎时用 `rand::thread_rng()` 生成 32 字节 hex 并写回 config（`personal_hub_crypto.rs:3,52` 已用 `rand::RngCore`，无新增依赖）。
   实现位置：`upsert_remote_engine` 命令入口，`read cipher_key` 为空则生成 + 落盘 config，再继续加密 token。

2. **远端 `config.workspaces` 可能为空**：若远端未配置工作区，`sync` 返回空列表。UI 需给出「远端未配置工作区，请在远端设置中添加」提示，且**禁止**在远端工作区列表为空时创建远程会话（否则 `remoteWorkDir` 为 `None`，Rust 侧会报 `ConfigError`）。

3. **Web 端（移动端/浏览器）管理入口**：§4.6 已列出需注册的 IPC dispatch。建议 MVP 一并完成（成本极低），否则移动端设置页无法管理远程引擎，需文档标注「仅桌面端可配置」。
