//! 钉钉相关命令

use crate::services::dingtalk_service::{DingTalkService, DingTalkConfig};
use crate::AppState;
use tauri::{State, Window};
use std::sync::{Arc, Mutex};

/// 启动钉钉服务
#[tauri::command]
pub async fn start_dingtalk_service(
    config: DingTalkConfig,
    window: Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    service.start(config, window)
}

/// 停止钉钉服务
#[tauri::command]
pub async fn stop_dingtalk_service(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    service.stop()
}

/// 发送消息到钉钉
#[tauri::command]
pub async fn send_dingtalk_message(
    response: String,
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    service.send_message(response, conversation_id)
}

/// 检查钉钉服务是否运行
#[tauri::command]
pub async fn is_dingtalk_service_running(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    Ok(service.is_running())
}

/// 获取钉钉服务配置
#[tauri::command]
pub async fn get_dingtalk_config(
    state: State<'_, AppState>,
) -> Result<Option<DingTalkConfig>, String> {
    let service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    Ok(service.config().cloned())
}

/// 测试钉钉连接
///
/// 步骤：
/// 1. 检查服务是否运行
/// 2. 如果未运行，启动服务
/// 3. 发送测试消息
#[tauri::command]
pub async fn test_dingtalk_connection(
    test_message: String,
    conversation_id: String,
    config: DingTalkConfig,
    window: Window,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // 1. 检查服务是否运行
    let is_running = {
        let service = state.dingtalk_service.lock()
            .map_err(|e| format!("获取服务失败: {}", e))?;
        service.is_running()
    };

    // 2. 如果未运行，先启动服务
    if !is_running {
        let mut service = state.dingtalk_service.lock()
            .map_err(|e| format!("获取服务失败: {}", e))?;

        // 启动服务
        service.start(config, window)?;

        // 等待一小段时间让服务初始化
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // 3. 发送测试消息
    let mut service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    service.send_message(test_message, conversation_id)?;

    Ok("测试消息已发送".to_string())
}
