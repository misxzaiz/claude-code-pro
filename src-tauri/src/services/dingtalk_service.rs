//! 钉钉服务管理模块
//! 负责启动和管理 Node.js 钉钉桥接服务进程

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio, Child};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};

/// 钉钉服务配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DingTalkConfig {
    pub app_key: String,
    pub app_secret: String,
    pub enabled: bool,
}

/// IPC 消息类型（用于进程间通信）
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum IPCMessage {
    /// 从钉钉接收的消息
    Message {
        conversation_id: String,
        sender_name: String,
        content: String,
    },
    /// 服务状态更新
    Status {
        running: bool,
        error: Option<String>,
    },
}

/// 钉钉服务
pub struct DingTalkService {
    /// Node.js 子进程
    child: Option<Child>,
    /// 当前配置
    config: Option<DingTalkConfig>,
}

impl DingTalkService {
    pub fn new() -> Self {
        Self {
            child: None,
            config: None,
        }
    }

    /// 启动钉钉服务
    pub fn start(&mut self, config: DingTalkConfig, window: Window) -> Result<(), String> {
        if self.child.is_some() {
            return Err("钉钉服务已在运行".to_string());
        }

        // 查找 Node.js 可执行文件
        let node_path = find_node_path()
            .ok_or("未找到 Node.js，请确保已安装 Node.js")?;

        // 查找桥接服务脚本
        let bridge_script = std::env::current_exe()
            .map_err(|e| format!("获取可执行文件路径失败: {}", e))?
            .parent()
            .ok_or("无法获取可执行文件目录")?
            .join("dingtalk-bridge.js");

        if !bridge_script.exists() {
            return Err(format!(
                "钉钉桥接服务脚本不存在: {}",
                bridge_script.display()
            ));
        }

        // 启动 Node.js 钉钉桥接服务
        let mut child = Command::new(&node_path)
            .arg(&bridge_script)
            .arg("--app-key")
            .arg(&config.app_key)
            .arg("--app-secret")
            .arg(&config.app_secret)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动钉钉服务失败: {}", e))?;

        // 发送 READY 信号
        if let Some(mut stdin) = child.stdin.take() {
            writeln!(stdin, "READY")
                .map_err(|e| format!("发送 READY 信号失败: {}", e))?;
        }

        // 启动线程读取 stdout
        let window_clone = window.clone();
        if let Some(stdout) = child.stdout.take() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(line) if !line.is_empty() => {
                            // 尝试解析 JSON 消息
                            if let Ok(ipc_msg) = serde_json::from_str::<IPCMessage>(&line) {
                                match ipc_msg {
                                    IPCMessage::Message { conversation_id, sender_name, content } => {
                                        let _ = window_clone.emit("dingtalk:message", serde_json::json!({
                                            "conversationId": conversation_id,
                                            "senderName": sender_name,
                                            "content": content,
                                        }));
                                    }
                                    IPCMessage::Status { running, error } => {
                                        let _ = window_clone.emit("dingtalk:status", serde_json::json!({
                                            "running": running,
                                            "error": error,
                                        }));
                                    }
                                }
                            } else {
                                // 非 JSON 行，可能是日志
                                eprintln!("[钉钉服务] {}", line);
                            }
                        }
                        Err(e) => {
                            eprintln!("[钉钉服务] 读取输出失败: {}", e);
                            break;
                        }
                        _ => {}
                    }
                }
            });
        }

        // 启动线程读取 stderr（用于调试）
        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        eprintln!("[钉钉服务 stderr] {}", line);
                    }
                }
            });
        }

        self.child = Some(child);
        self.config = Some(config);

        Ok(())
    }

    /// 停止钉钉服务
    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            child.kill()
                .map_err(|e| format!("停止钉钉服务失败: {}", e))?;
        }
        self.config = None;
        Ok(())
    }

    /// 发送消息到钉钉
    pub fn send_message(&mut self, response: String, conversation_id: String) -> Result<(), String> {
        let child = self.child.as_mut()
            .ok_or("钉钉服务未运行")?;

        let stdin = child.stdin.as_mut()
            .ok_or("无法获取服务 stdin")?;

        let message = serde_json::json!({
            "type": "send",
            "response": response,
            "conversationId": conversation_id,
        });

        writeln!(stdin, "{}", message)
            .map_err(|e| format!("发送消息失败: {}", e))
    }

    /// 检查服务是否正在运行
    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }

    /// 获取当前配置
    pub fn config(&self) -> Option<&DingTalkConfig> {
        self.config.as_ref()
    }
}

impl Drop for DingTalkService {
    fn drop(&mut self) {
        // 自动停止服务
        let _ = self.stop();
    }
}

/// 查找 Node.js 可执行文件路径
fn find_node_path() -> Option<String> {
    // Windows
    #[cfg(windows)]
    {
        let paths = vec![
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ];
        for path in paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        // 尝试从 PATH 环境变量查找
        if let Ok(output) = Command::new("where").arg("node.exe").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout);
                let first_line = path.lines().next()?;
                return Some(first_line.to_string());
            }
        }
    }

    // Unix-like (Linux, macOS)
    #[cfg(not(windows))]
    {
        if let Ok(output) = Command::new("which").arg("node").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout);
                return Some(path.trim().to_string());
            }
        }
    }

    None
}
