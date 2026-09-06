use std::io::ErrorKind;
use std::sync::Arc;

use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::AppState;
use super::router::create_router;

const ENV_WEB_PORT: &str = "POLARIS_WEB_PORT";

/// Dev-only: 发现文件目录名（位于项目根，由 vite dev middleware 映射到
/// `/.polaris-dev/server.json`；不放 public/ 避免 build 时被拷进产物）。
/// 仅 debug 构建（debug_assertions）写入，release 构建物理剔除此逻辑。
#[cfg(debug_assertions)]
const DEV_DISCOVERY_DIR: &str = ".polaris-dev";
#[cfg(debug_assertions)]
const DEV_DISCOVERY_FILE: &str = "server.json";

/// Dev-only: 把「实际端口 + 当前 token 的 md5」写到发现文件，供 dev 前端自发现。
///
/// 设计要点（不污染线上 / 已安装 web）：
/// - 仅 debug_assertions 时编译此函数，release 构建物理剔除（线上 web 零影响）
/// - token md5 从运行中 config.web.token 现算，不写回 config、不改动它
/// - 前端只在 VITE_FORCE_HTTP=1 时读取，正常 tauri dev 不读，互不干扰
/// - 进程退出时删除文件（cleanup_dev_discovery_file）
#[cfg(debug_assertions)]
fn write_dev_discovery_file(state: &Arc<AppState>, port: u16) {
    // token md5：后端 config 是什么 token，前端就用什么 token 的 md5，天然一致。
    let token_md5 = state
        .clone_config_web()
        .ok()
        .and_then(|c| c.web.token)
        .filter(|t| !t.is_empty())
        .map(|t| format!("{:x}", md5::compute(t.as_bytes())));

    let url = format!("http://localhost:{}", port);
    let payload = serde_json::json!({
        "url": url,
        "tokenMd5": token_md5,
        "generatedAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        "pid": std::process::id(),
    });

    // 项目根 = CARGO_MANIFEST_DIR(src-tauri).parent()
    let Some(root) = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().map(|p| p.to_path_buf()) else {
        return;
    };
    let dir = root.join(DEV_DISCOVERY_DIR);
    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!("[Web][dev] create discovery dir failed: {}", e);
        return;
    }
    let path = dir.join(DEV_DISCOVERY_FILE);
    // 原子写：先写临时文件再 rename，避免前端读到半截 JSON。
    let tmp = dir.join(format!("{}.tmp", DEV_DISCOVERY_FILE));
    match std::fs::write(&tmp, serde_json::to_string(&payload).unwrap_or_default()) {
        Ok(()) => {
            if let Err(e) = std::fs::rename(&tmp, &path) {
                tracing::warn!("[Web][dev] rename discovery file failed: {}", e);
            } else {
                tracing::info!("[Web][dev] discovery file written: {} -> {}", path.display(), url);
            }
        }
        Err(e) => tracing::warn!("[Web][dev] write discovery file failed: {}", e),
    }
}

/// Dev-only: 删除发现文件（进程退出时调用，尽力而为）。
#[cfg(debug_assertions)]
pub fn cleanup_dev_discovery_file() {
    if let Some(root) = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().map(|p| p.to_path_buf()) {
        let path = root.join(DEV_DISCOVERY_DIR).join(DEV_DISCOVERY_FILE);
        let _ = std::fs::remove_file(path);
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebServerStatus {
    pub running: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub url: Option<String>,
}

impl WebServerStatus {
    pub fn stopped() -> Self {
        Self {
            running: false,
            host: None,
            port: None,
            url: None,
        }
    }

    pub fn running(host: String, port: u16) -> Self {
        let access_host = if host == "0.0.0.0" || host == "::" {
            "localhost".to_string()
        } else {
            host.clone()
        };

        Self {
            running: true,
            host: Some(host),
            port: Some(port),
            url: Some(format!("http://{}:{}", access_host, port)),
        }
    }
}

/// Handle to a running web server, allowing graceful shutdown.
pub struct WebServerHandle {
    /// Token to signal graceful shutdown.
    pub shutdown: CancellationToken,
    /// Join handle for the spawned server task.
    pub task: JoinHandle<Result<(), Box<dyn std::error::Error + Send + Sync>>>,
    pub host: String,
    pub port: u16,
}

/// Web server managing the HTTP/WS lifecycle for LAN browser access.
pub struct WebServer {
    state: Arc<AppState>,
    shutdown: CancellationToken,
}

impl WebServer {
    pub fn new(state: Arc<AppState>) -> Self {
        Self {
            state,
            shutdown: CancellationToken::new(),
        }
    }

    pub fn shutdown_token(&self) -> CancellationToken {
        self.shutdown.clone()
    }

    /// Resolve effective port: `POLARIS_WEB_PORT` env var overrides config.
    pub fn resolve_port(config_port: u16) -> u16 {
        std::env::var(ENV_WEB_PORT)
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(config_port)
    }

    pub async fn start_on_available_port(
        self,
        host: &str,
        preferred_port: u16,
    ) -> Result<WebServerHandle, Box<dyn std::error::Error + Send + Sync>> {
        let shutdown = self.shutdown.clone();
        let state = self.state.clone();
        let mut port = preferred_port;

        loop {
            let addr = format!("{}:{}", host, port);
            match tokio::net::TcpListener::bind(&addr).await {
                Ok(listener) => {
                    let local_addr = listener.local_addr()?;
                    let actual_port = local_addr.port();
                    let task_shutdown = shutdown.clone();
                    let task_host = host.to_string();

                    if actual_port != preferred_port {
                        tracing::warn!(
                            "[Web] Preferred port {} unavailable, using {}",
                            preferred_port,
                            actual_port
                        );
                    }
                    tracing::info!("[Web] Server listening on {}", local_addr);

                    // Dev-only: 写发现文件供 dev 前端自发现（release 构建剔除）。
                    #[cfg(debug_assertions)]
                    write_dev_discovery_file(&state, actual_port);

                    let task = tokio::spawn(async move {
                        let app = create_router(state);
                        let result = axum::serve(listener, app)
                            .with_graceful_shutdown(async move { task_shutdown.cancelled().await })
                            .await;

                        if let Err(e) = &result {
                            tracing::error!("[Web] Server error: {}", e);
                        } else {
                            tracing::info!("[Web] Server shut down gracefully");
                        }

                        result.map_err(|e| e.into())
                    });

                    return Ok(WebServerHandle {
                        shutdown,
                        task,
                        host: task_host,
                        port: actual_port,
                    });
                }
                Err(e) if e.kind() == ErrorKind::AddrInUse && port < u16::MAX => {
                    tracing::warn!("[Web] Port {} is in use, trying {}", port, port + 1);
                    port += 1;
                }
                Err(e) => {
                    tracing::error!("[Web] Failed to bind from {}:{}: {}", host, preferred_port, e);
                    return Err(e.into());
                }
            }
        }
    }

    /// Bind to `addr` and serve until cancelled or fatal error.
    /// Returns a `WebServerHandle` for lifecycle management (graceful shutdown).
    pub fn start(self, addr: &str) -> WebServerHandle {
        let shutdown = self.shutdown.clone();
        let state = self.state.clone();
        let addr = addr.to_string();
        let (host, port) = addr
            .rsplit_once(':')
            .and_then(|(host, port)| port.parse::<u16>().ok().map(|port| (host.to_string(), port)))
            .unwrap_or_else(|| (addr.clone(), 0));

        let task = tokio::spawn(async move {
            let app = create_router(state);
            let listener = match tokio::net::TcpListener::bind(&addr).await {
                Ok(l) => l,
                Err(e) => {
                    tracing::error!("[Web] Failed to bind to {}: {}", addr, e);
                    return Err(e.into());
                }
            };
            let local_addr = listener.local_addr()?;
            tracing::info!("[Web] Server listening on {}", local_addr);

            let result = axum::serve(listener, app)
                .with_graceful_shutdown(async move { shutdown.cancelled().await })
                .await;

            if let Err(e) = &result {
                tracing::error!("[Web] Server error: {}", e);
            } else {
                tracing::info!("[Web] Server shut down gracefully");
            }

            result.map_err(|e| e.into())
        });

        WebServerHandle {
            shutdown: self.shutdown,
            task,
            host,
            port,
        }
    }

    /// Signal the server to shut down gracefully.
    pub fn cancel(&self) {
        self.shutdown.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_port_uses_config_when_no_env() {
        // Ensure env var is not set
        std::env::remove_var(ENV_WEB_PORT);
        assert_eq!(WebServer::resolve_port(9800), 9800);
    }

    #[test]
    fn resolve_port_env_overrides_config() {
        std::env::set_var(ENV_WEB_PORT, "8080");
        assert_eq!(WebServer::resolve_port(9800), 8080);
        std::env::remove_var(ENV_WEB_PORT);
    }

    #[test]
    fn resolve_port_ignores_invalid_env() {
        std::env::set_var(ENV_WEB_PORT, "not-a-number");
        assert_eq!(WebServer::resolve_port(9800), 9800);
        std::env::remove_var(ENV_WEB_PORT);
    }
}
