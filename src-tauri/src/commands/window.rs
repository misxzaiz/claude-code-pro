use tauri::{AppHandle, Manager};

/// 显示悬浮窗，隐藏主窗口
#[tauri::command]
pub async fn show_floating_window(app: AppHandle) -> Result<(), String> {
    // 隐藏主窗口
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }

    // 显示悬浮窗
    if let Some(floating) = app.get_webview_window("floating") {
        floating.show().map_err(|e| e.to_string())?;
        floating.set_always_on_top(true).map_err(|e| e.to_string())?;
        floating.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("悬浮窗不存在".to_string())
    }
}

/// 显示主窗口，隐藏悬浮窗
#[tauri::command]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    // 隐藏悬浮窗
    if let Some(floating) = app.get_webview_window("floating") {
        let _ = floating.hide();
    }

    // 显示主窗口
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("主窗口不存在".to_string())
    }
}

/// 切换悬浮窗状态
#[tauri::command]
pub async fn toggle_floating_window(app: AppHandle) -> Result<bool, String> {
    if let Some(floating) = app.get_webview_window("floating") {
        let is_visible = floating.is_visible().map_err(|e| e.to_string())?;

        if is_visible {
            // 当前悬浮窗显示，切换到主窗口
            show_main_window(app).await?;
            Ok(false)
        } else {
            // 当前悬浮窗隐藏，切换到悬浮窗
            show_floating_window(app).await?;
            Ok(true)
        }
    } else {
        Err("悬浮窗不存在".to_string())
    }
}

/// 检查悬浮窗是否可见
#[tauri::command]
pub async fn is_floating_window_visible(app: AppHandle) -> Result<bool, String> {
    if let Some(floating) = app.get_webview_window("floating") {
        floating.is_visible().map_err(|e| e.to_string())
    } else {
        Ok(false)
    }
}

/// 设置悬浮窗位置
#[tauri::command]
pub async fn set_floating_window_position(
    app: AppHandle,
    x: i32,
    y: i32,
) -> Result<(), String> {
    if let Some(floating) = app.get_webview_window("floating") {
        floating.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
            .map_err(|e| e.to_string())
    } else {
        Err("悬浮窗不存在".to_string())
    }
}

/// 获取悬浮窗位置
#[tauri::command]
pub async fn get_floating_window_position(
    app: AppHandle,
) -> Result<Option<(i32, i32)>, String> {
    if let Some(floating) = app.get_webview_window("floating") {
        let position = floating.outer_position().map_err(|e| e.to_string())?;
        Ok(Some((position.x, position.y)))
    } else {
        Err("悬浮窗不存在".to_string())
    }
}
