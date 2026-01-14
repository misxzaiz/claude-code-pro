/// IFlow JSONL 事件模型
///
/// IFlow CLI 将会话保存为 JSONL 格式文件
/// 文件位置: ~/.iflow/projects/[编码项目路径]/session-[id].jsonl

use serde::{Deserialize, Serialize};

/// IFlow JSONL 事件（顶层结构）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowJsonlEvent {
    /// 消息唯一 ID
    pub uuid: String,
    /// 父消息 ID
    #[serde(rename = "parentUuid")]
    pub parent_uuid: Option<String>,
    /// 会话 ID
    #[serde(rename = "sessionId")]
    pub session_id: String,
    /// 时间戳
    pub timestamp: String,
    /// 事件类型: user, assistant, tool_result, error 等
    #[serde(rename = "type")]
    pub event_type: String,
    /// 是否为侧链
    #[serde(rename = "isSidechain")]
    pub is_sidechain: bool,
    /// 用户类型
    #[serde(rename = "userType")]
    pub user_type: String,
    /// 消息内容
    pub message: Option<IFlowMessage>,
    /// 当前工作目录
    pub cwd: Option<String>,
    /// Git 分支
    #[serde(rename = "gitBranch")]
    pub git_branch: Option<String>,
    /// 版本
    pub version: Option<String>,
    /// 工具调用结果
    #[serde(rename = "toolUseResult")]
    pub tool_use_result: Option<IFlowToolUseResult>,
}

/// IFlow 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowMessage {
    /// 消息 ID（仅 assistant 类型）
    pub id: Option<String>,
    /// 消息类型
    #[serde(rename = "type")]
    pub message_type: Option<String>,
    /// 角色: user, assistant
    pub role: String,
    /// 内容数组
    pub content: serde_json::Value,
    /// 模型名称
    pub model: Option<String>,
    /// 停止原因
    #[serde(rename = "stop_reason")]
    pub stop_reason: Option<String>,
    /// Token 使用情况
    pub usage: Option<IFlowUsage>,
}

/// IFlow Token 使用情况
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowUsage {
    /// 输入 Token 数
    #[serde(rename = "input_tokens")]
    pub input_tokens: u32,
    /// 输出 Token 数
    #[serde(rename = "output_tokens")]
    pub output_tokens: u32,
}

/// IFlow 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowToolUseResult {
    /// 工具名称
    #[serde(rename = "toolName")]
    pub tool_name: String,
    /// 状态
    pub status: String,
    /// 时间戳
    pub timestamp: u64,
}

impl IFlowJsonlEvent {
    /// 解析 JSONL 行
    pub fn parse_line(line: &str) -> Option<Self> {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        serde_json::from_str(line).ok()
    }

    /// 转换为统一的 StreamEvent（复用 Claude Code 的事件类型）
    /// 返回多个事件，因为一个 IFlow 事件可能包含多个 StreamEvent
    pub fn to_stream_events(&self) -> Vec<crate::models::events::StreamEvent> {
        let mut events = Vec::new();

        match self.event_type.as_str() {
            "user" => {
                // 用户消息可能包含工具结果
                if let Some(ref message) = self.message {
                    if let Some(tool_results) = self.extract_tool_results(message) {
                        events.extend(tool_results);
                    }
                }
            }
            "assistant" => {
                // assistant 消息可能包含文本和工具调用
                if let Some(ref message) = self.message {
                    // 首先添加工具调用开始事件
                    if let Some(tool_starts) = self.extract_tool_starts(message) {
                        events.extend(tool_starts);
                    }
                    // 然后添加文本/assistant 消息
                    if let Some(assistant_event) = self.to_assistant_event(message) {
                        events.push(assistant_event);
                    }
                    // 检查是否会话结束
                    if message.stop_reason.is_some() {
                        events.push(crate::models::events::StreamEvent::SessionEnd);
                    }
                }
            }
            _ => {
                eprintln!("[IFlow] 未知事件类型: {}", self.event_type);
            }
        }

        events
    }

    /// 转换为 assistant 事件
    fn to_assistant_event(&self, message: &IFlowMessage) -> Option<crate::models::events::StreamEvent> {
        // 解析 content - 可能是字符串或数组
        let content_blocks = match &message.content {
            serde_json::Value::String(s) => {
                vec![serde_json::json!({
                    "type": "text",
                    "text": s
                })]
            }
            serde_json::Value::Array(arr) => {
                let mut blocks = Vec::new();
                for item in arr {
                    if let Some(obj) = item.as_object() {
                        let block_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("text");
                        match block_type {
                            "text" => {
                                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                                    blocks.push(serde_json::json!({
                                        "type": "text",
                                        "text": text
                                    }));
                                }
                            }
                            "tool_use" => {
                                // 工具调用也作为内容的一部分
                                blocks.push(serde_json::json!({
                                    "type": "tool_use",
                                    "id": obj.get("id"),
                                    "name": obj.get("name"),
                                    "input": obj.get("input")
                                }));
                            }
                            _ => {}
                        }
                    }
                }
                blocks
            }
            _ => Vec::new(),
        };

        if content_blocks.is_empty() {
            return None;
        }

        Some(crate::models::events::StreamEvent::Assistant {
            message: serde_json::json!({
                "content": content_blocks,
                "model": message.model,
                "id": message.id,
                "stop_reason": message.stop_reason,
            }),
        })
    }

    /// 从消息中提取工具调用开始事件
    fn extract_tool_starts(&self, message: &IFlowMessage) -> Option<Vec<crate::models::events::StreamEvent>> {
        let mut events = Vec::new();

        let content_array = match &message.content {
            serde_json::Value::Array(arr) => arr,
            _ => return None,
        };

        for item in content_array {
            if let Some(obj) = item.as_object() {
                if let Some(tool_use) = obj.get("type").and_then(|v| v.as_str()) {
                    if tool_use == "tool_use" {
                        let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                        let input = obj.get("input").cloned().unwrap_or(serde_json::Value::Null);

                        events.push(crate::models::events::StreamEvent::ToolStart {
                            tool_name: name.to_string(),
                            input,
                        });
                    }
                }
            }
        }

        if events.is_empty() {
            None
        } else {
            Some(events)
        }
    }

    /// 从用户消息中提取工具结果事件
    fn extract_tool_results(&self, message: &IFlowMessage) -> Option<Vec<crate::models::events::StreamEvent>> {
        let mut events = Vec::new();

        // content 可能是字符串或数组
        let content_array = match &message.content {
            serde_json::Value::Array(arr) => arr,
            serde_json::Value::String(_) => return None,
            _ => return None,
        };

        for item in content_array {
            if let Some(obj) = item.as_object() {
                if let Some(result_type) = obj.get("type").and_then(|v| v.as_str()) {
                    if result_type == "tool_result" {
                        let tool_use_id = obj.get("tool_use_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        // 尝试从 content 中提取实际输出
                        let output = self.extract_tool_output(obj);

                        events.push(crate::models::events::StreamEvent::ToolEnd {
                            tool_name: tool_use_id.to_string(),
                            output: Some(output),
                        });
                    }
                }
            }
        }

        if events.is_empty() {
            None
        } else {
            Some(events)
        }
    }

    /// 从 tool_result 对象中提取实际输出
    fn extract_tool_output(&self, obj: &serde_json::Map<String, serde_json::Value>) -> String {
        // 优先使用 resultDisplay
        if let Some(display) = obj.get("resultDisplay").and_then(|v| v.as_str()) {
            return display.to_string();
        }

        // 尝试从 content.functionResponse.response.output 提取
        if let Some(content) = obj.get("content") {
            if let Some(func_resp) = content.get("functionResponse") {
                if let Some(response) = func_resp.get("response") {
                    if let Some(output) = response.get("output").and_then(|v| v.as_str()) {
                        return output.to_string();
                    }
                    // 如果 output 不是字符串，尝试整个 response
                    if let Some(response_str) = serde_json::to_string(response).ok() {
                        return response_str;
                    }
                }
            }
        }

        // 默认返回空字符串
        String::new()
    }

    /// 是否为会话结束事件
    pub fn is_session_end(&self) -> bool {
        // IFlow 没有明确的 session_end 事件
        // 我们通过检查是否有 stop_reason 来判断
        if let Some(ref message) = self.message {
            if let Some(ref stop_reason) = message.stop_reason {
                return stop_reason == "STOP" || stop_reason == "max_tokens" || stop_reason == "end_turn";
            }
        }
        false
    }
}
