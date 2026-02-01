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
