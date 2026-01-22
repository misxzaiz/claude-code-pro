/**
 * OpenAI 兼容 API 代理模块
 *
 * 通过 Tauri 后端代理 OpenAI API 请求，避免浏览器 CORS 限制
 */

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tracing::{info, error, warn};
use futures_util::stream::StreamExt;

/// OpenAI 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIConfig {
    #[serde(rename = "apiKey")]
    pub api_key: String,

    #[serde(rename = "baseURL")]
    pub base_url: String,

    pub model: String,

    #[serde(default = "default_temperature")]
    pub temperature: f32,

    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,

    #[serde(default = "default_enable_tools")]
    pub enable_tools: bool,
}

fn default_temperature() -> f32 { 0.7 }
fn default_max_tokens() -> u32 { 4096 }
fn default_enable_tools() -> bool { true }

/// 聊天消息
#[derive(Debug, Clone, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

/// 聊天请求
#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
    stream: bool,
}

/// SSE chunk 响应（增量部分）
#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    delta: Delta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

/**
 * 发起 OpenAI 聊天请求（流式）
 */
#[tauri::command]
pub async fn start_openai_chat(
    message: String,
    config: OpenAIConfig,
    app: AppHandle,
) -> Result<String, String> {
    info!("[OpenAI] 启动聊天: model={}, message_len={}", config.model, message.len());

    let session_id = uuid::Uuid::new_v4().to_string();

    // 发送会话开始事件
    emit_event(&app, &session_id, "session_start", serde_json::json!({
        "sessionId": &session_id
    }))?;

    // 构建请求
    let client = Client::new();
    let url = format!("{}/chat/completions", config.base_url);

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: "You are a helpful coding assistant.".to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: message,
        },
    ];

    let request_body = ChatRequest {
        model: config.model.clone(),
        messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        stream: true,
    };

    info!("[OpenAI] 发送请求到: {}", url);

    // 发送 HTTP 请求
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            error!("[OpenAI] 请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        error!("[OpenAI] API 错误 ({}): {}", status, error_text);
        return Err(format!("API 错误 ({}): {}", status, error_text));
    }

    // 处理流式响应
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_content = String::new();

    info!("[OpenAI] 开始接收流式响应");

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e: reqwest::Error| {
            error!("[OpenAI] 读取流失败: {}", e);
            format!("读取流失败: {}", e)
        })?;

        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // 处理缓冲区中的完整行
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer.drain(..=newline_pos).collect::<String>();
            let remaining_start = buffer.chars().next().map_or(0, |c| c.len_utf8());
            buffer = buffer[remaining_start..].to_string();

            let trimmed = line.trim();
            if trimmed.is_empty() || !trimmed.starts_with("data: ") {
                continue;
            }

            let data = &trimmed[6..];
            if data == "[DONE]" {
                info!("[OpenAI] 流结束标记");
                break;
            }

            // 解析 JSON
            match serde_json::from_str::<serde_json::Value>(data) {
                Ok(chunk_json) => {
                    // 提取内容
                    if let Some(content) = chunk_json["choices"][0]["delta"]["content"].as_str() {
                        if !content.is_empty() {
                            full_content.push_str(content);
                            emit_event(&app, &session_id, "text_delta", serde_json::json!({
                                "text": content,
                                "sessionId": &session_id
                            }))?;
                        }
                    }

                    // 检查是否结束
                    if let Some(finish_reason) = chunk_json["choices"][0]["finish_reason"].as_str() {
                        info!("[OpenAI] 完成原因: {}", finish_reason);
                        break;
                    }
                }
                Err(e) => {
                    warn!("[OpenAI] 解析 chunk 失败: {}, data: {}", e, data);
                }
            }
        }
    }

    info!("[OpenAI] 聊天完成，总内容长度: {}", full_content.len());

    // 发送会话结束事件
    emit_event(&app, &session_id, "session_end", serde_json::json!({
        "sessionId": &session_id,
        "reason": "completed"
    }))?;

    Ok(session_id)
}

/**
 * 继续 OpenAI 聊天会话（多轮对话）
 *
 * TODO: 当前实现复用 start_openai_chat，后续需要维护会话历史
 */
#[tauri::command]
pub async fn continue_openai_chat(
    _session_id: String,
    message: String,
    config: OpenAIConfig,
    app: AppHandle,
) -> Result<(), String> {
    info!("[OpenAI] 继续聊天: session_id={}", _session_id);
    // 暂时直接调用 start_openai_chat
    start_openai_chat(message, config, app).await?;
    Ok(())
}

/**
 * 中断 OpenAI 聊天会话
 *
 * TODO: 需要维护活跃会话列表并实现中断逻辑
 */
#[tauri::command]
pub async fn interrupt_openai_chat(_session_id: String) -> Result<(), String> {
    info!("[OpenAI] 中断聊天: session_id={}", _session_id);
    // TODO: 实现中断逻辑
    Ok(())
}

/**
 * 辅助函数：发送聊天事件
 */
fn emit_event(
    app: &AppHandle,
    session_id: &str,
    event_type: &str,
    payload: serde_json::Value,
) -> Result<(), String> {
    // 手动合并 JSON 对象
    let mut event = serde_json::json!({
        "type": event_type,
        "sessionId": session_id
    });

    // 将 payload 的字段合并到 event 中
    if let Some(obj) = payload.as_object() {
        if let Some(event_obj) = event.as_object_mut() {
            for (key, value) in obj {
                event_obj.insert(key.clone(), value.clone());
            }
        }
    }

    // 转换为 JSON 字符串后发送（与 chat.rs 保持一致）
    let event_json = serde_json::to_string(&event)
        .map_err(|e| format!("序列化事件失败: {}", e))?;

    app.emit("chat-event", event_json)
        .map_err(|e| {
            error!("[OpenAI] 发送事件失败: {}", e);
            format!("发送事件失败: {}", e)
        })
}

/**
 * 保存 OpenAI 配置
 */
#[tauri::command]
pub async fn save_openai_config(config: OpenAIConfig) -> Result<(), String> {
    info!("[OpenAI] 保存配置: model={}, base_url={}", config.model, config.base_url);
    info!("[OpenAI] 完整配置: {:?}", config);

    // 获取配置目录
    let config_dir = dirs::config_dir()
        .ok_or("无法获取配置目录")?;
    let config_path = config_dir.join("polaris").join("openai_config.json");

    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 序列化配置
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化失败: {}", e))?;

    // 写入文件
    std::fs::write(&config_path, json)
        .map_err(|e| format!("写入配置失败: {}", e))?;

    info!("[OpenAI] 配置已保存到: {:?}", config_path);
    Ok(())
}

/**
 * 加载 OpenAI 配置
 */
#[tauri::command]
pub async fn load_openai_config() -> Result<Option<OpenAIConfig>, String> {
    // 获取配置目录
    let config_dir = dirs::config_dir()
        .ok_or("无法获取配置目录")?;
    let config_path = config_dir.join("polaris").join("openai_config.json");

    // 检查文件是否存在
    if !config_path.exists() {
        info!("[OpenAI] 配置文件不存在: {:?}", config_path);
        return Ok(None);
    }

    // 读取配置
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;

    // 解析配置
    let config: OpenAIConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;

    info!("[OpenAI] 配置已加载: model={}", config.model);
    Ok(Some(config))
}
