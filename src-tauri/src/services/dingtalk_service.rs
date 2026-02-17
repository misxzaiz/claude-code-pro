use std::sync::{Arc, Mutex};
use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader};
use tauri::{Window, Emitter};
use serde_json::{Value, json};
use crate::models::config::DingTalkConfig;

/// 钉钉消息结构
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DingTalkMessage {
    pub conversation_id: String,
    pub sender_name: String,
    pub content: String,
    #[serde(rename = "type")]
    pub msg_type: String,
}

/// 钉钉服务状态
#[derive(Debug, Clone, serde::Serialize)]
pub struct DingTalkServiceStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub error: Option<String>,
}

/// 钉钉服务
pub struct DingTalkService {
    process: Option<Child>,
    config: Option<DingTalkConfig>,
    window: Option<Window>,
}

impl DingTalkService {
    /// 创建新服务
    pub fn new() -> Self {
        Self {
            process: None,
            config: None,
            window: None,
        }
    }

    /// 检查服务是否运行
    pub fn is_running(&self) -> bool {
        self.process.is_some()
    }

    /// 启动服务
    pub fn start(&mut self, config: DingTalkConfig, window: Window) -> Result<(), String> {
        if self.is_running() {
            return Ok(());
        }

        // 查找 Node.js 可执行文件
        let node_cmd = self.find_node_command()
            .ok_or_else(|| "未找到 Node.js。请确保已安装 Node.js".to_string())?;

        // 查找桥接脚本
        let bridge_script = self.find_bridge_script()
            .ok_or_else(|| "未找到钉钉桥接脚本".to_string())?;

        println!("[DingTalkService] 启动服务:");
        println!("  Node.js: {}", node_cmd);
        println!("  脚本: {}", bridge_script);
        println!("  AppKey: {}", config.app_key);
        println!("  端口: {}", config.webhook_port);

        // 启动桥接进程
        let mut child = Command::new(&node_cmd)
            .arg(&bridge_script)
            .arg("--app-key")
            .arg(&config.app_key)
            .arg("--app-secret")
            .arg(&config.app_secret)
            .arg("--port")
            .arg(config.webhook_port.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动桥接进程失败: {}", e))?;

        let pid = child.id();
        println!("[DingTalkService] 桥接进程 PID: {}", pid);

        // 获取 stdout 和 stderr
        let stdout = child.stdout.take().expect("Failed to take stdout");
        let stderr = child.stderr.take().expect("Failed to take stderr");

        // 克隆窗口引用用于线程
        let window_clone = window.clone();
        let config_clone = config.clone();

        // 监听 stderr (日志输出)
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    println!("[DingTalk Bridge] {}", line);
                }
            }
        });

        // 监听 stdout (JSON 消息)
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    // 尝试解析 JSON 消息
                    if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                        if let Some(msg_type) = msg.get("type").and_then(|v| v.as_str()) {
                            match msg_type {
                                "message" => {
                                    // 解析钉钉消息
                                    if let (Some(conversation_id), Some(sender_name), Some(content)) = (
                                        msg.get("conversationId").and_then(|v| v.as_str()),
                                        msg.get("senderName").and_then(|v| v.as_str()),
                                        msg.get("content").and_then(|v| v.as_str()),
                                    ) {
                                        let dingtalk_msg = super::dingtalk_service::DingTalkMessage {
                                            conversation_id: conversation_id.to_string(),
                                            sender_name: sender_name.to_string(),
                                            content: content.to_string(),
                                            msg_type: "text".to_string(),
                                        };

                                        // 发送到前端
                                        let _ = window_clone.emit("dingtalk:message", dingtalk_msg);
                                    }
                                }
                                "status" => {
                                    // 状态更新
                                    let _ = window_clone.emit("dingtalk:status", msg);
                                }
                                _ => {
                                    // 其他消息类型
                                    println!("[DingTalkService] 未知消息类型: {}", msg_type);
                                }
                            }
                        }
                    }
                }
            }
        });

        // 保存进程和配置
        self.process = Some(child);
        self.config = Some(config.clone());
        self.window = Some(window.clone());

        // 发送状态更新
        let status = DingTalkServiceStatus {
            is_running: true,
            pid: Some(pid),
            port: Some(config.webhook_port),
            error: None,
        };
        let _ = window.emit("dingtalk:status", status);

        Ok(())
    }

    /// 停止服务
    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.process.take() {
            // 发送停止信号到 stdin
            if let Some(ref mut stdin) = child.stdin.as_mut() {
                use std::io::Write;
                let _ = writeln!(stdin, "{{\"type\":\"shutdown\"}}");
            }

            // 等待进程结束
            let _ = child.kill();
            let _ = child.wait();

            // 清空配置和窗口
            self.config = None;
            self.window = None;

            println!("[DingTalkService] 服务已停止");

            Ok(())
        } else {
            Err("服务未运行".to_string())
        }
    }

    /// 发送消息
    pub fn send_message(&mut self, content: String, conversation_id: String) -> Result<(), String> {
        if let Some(ref child) = self.process {
            if let Some(ref mut stdin) = child.stdin.as_ref() {
                use std::io::Write;

                let msg = json!({
                    "type": "send",
                    "conversationId": conversation_id,
                    "content": content
                });

                let msg_str = msg.to_string();
                writeln!(stdin, "{}", msg_str)
                    .map_err(|e| format!("写入 stdin 失败: {}", e))?;

                println!("[DingTalkService] 已发送消息: {} bytes", msg_str.len());
                Ok(())
            } else {
                Err("进程 stdin 不可用".to_string())
            }
        } else {
            Err("服务未运行".to_string())
        }
    }

    /// 获取状态
    pub fn status(&self) -> DingTalkServiceStatus {
        DingTalkServiceStatus {
            is_running: self.is_running(),
            pid: self.process.as_ref().map(|p| p.id()),
            port: self.config.as_ref().map(|c| c.webhook_port),
            error: None,
        }
    }

    /// 获取配置
    pub fn config(&self) -> Option<&DingTalkConfig> {
        self.config.as_ref()
    }

    /// 查找 Node.js 命令
    fn find_node_command(&self) -> Option<String> {
        // 尝试常见的 Node.js 命令
        let commands = if cfg!(windows) {
            vec!["node.exe", "node.cmd"]
        } else {
            vec!["node"]
        };

        for cmd in commands {
            if let Ok(output) = Command::new(cmd).arg("--version").output() {
                if output.status.success() {
                    return Some(cmd.to_string());
                }
            }
        }

        None
    }

    /// 查找桥接脚本
    fn find_bridge_script(&self) -> Option<String> {
        // 尝试多个可能的路径
        let possible_paths = vec![
            // 开发环境
            "src-tauri/dingtalk-bridge.js",
            // 生产环境 (相对于可执行文件)
            "../dingtalk-bridge.js",
        ];

        for path in possible_paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        None
    }
}

unsafe impl Send for DingTalkService {}
