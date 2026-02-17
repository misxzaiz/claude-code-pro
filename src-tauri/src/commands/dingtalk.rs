use tauri::{State, Window};
use crate::models::config::DingTalkConfig;
use crate::services::dingtalk_service::{DingTalkService, DingTalkServiceStatus};
use crate::AppState;

/// 启动钉钉服务
#[tauri::command]
pub async fn start_dingtalk_service(
    window: Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 获取配置
    let config = {
        let config_store = state.config_store.lock()
            .map_err(|e| format!("获取配置失败: {}", e))?;
        config_store.get().dingtalk.clone()
    };

    // 检查是否启用
    if !config.enabled {
        return Err("钉钉集成未启用".to_string());
    }

    // 检查配置
    if config.app_key.is_empty() || config.app_secret.is_empty() {
        return Err("钉钉配置不完整，请填写 AppKey 和 AppSecret".to_string());
    }

    // 启动服务
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

/// 发送钉钉消息
#[tauri::command]
pub async fn send_dingtalk_message(
    content: String,
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    service.send_message(content, conversation_id)
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

/// 获取钉钉服务状态
#[tauri::command]
pub async fn get_dingtalk_service_status(
    state: State<'_, AppState>,
) -> Result<DingTalkServiceStatus, String> {
    let service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    Ok(service.status())
}

/// 测试钉钉连接
#[tauri::command]
pub async fn test_dingtalk_connection(
    test_message: String,
    conversation_id: String,
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
        let config = {
            let config_store = state.config_store.lock()
                .map_err(|e| format!("获取配置失败: {}", e))?;
            config_store.get().dingtalk.clone()
        };

        let mut service = state.dingtalk_service.lock()
            .map_err(|e| format!("获取服务失败: {}", e))?;

        service.start(config, window)?;

        // 等待服务初始化
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // 3. 发送测试消息
    let mut service = state.dingtalk_service.lock()
        .map_err(|e| format!("获取服务失败: {}", e))?;

    service.send_message(test_message, conversation_id)?;

    Ok("测试消息已发送".to_string())
}
