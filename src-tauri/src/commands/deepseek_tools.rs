/**
 * DeepSeek Tools Commands
 *
 * 为 DeepSeek 原生引擎提供工具执行能力。
 * 桥接前端 DeepSeek 工具调用和后端实际执行。
 *
 * @author Polaris Team
 * @since 2025-01-24
 */

use tauri::State;
use std::fs;
use std::path::Path;
use std::process::Command;
use serde_json::Value;
use crate::error::{Result, AppError};

/**
 * Bash 执行结果
 */
#[derive(serde::Serialize)]
pub struct BashResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/**
 * 执行 Bash 命令
 *
 * @param command - 要执行的 shell 命令
 * @param session_id - 会话 ID (用于日志)
 * @param work_dir - 工作目录（可选）
 */
#[tauri::command]
pub async fn execute_bash(
    command: &str,
    session_id: &str,
    work_dir: Option<&str>,
) -> Result<BashResult> {
    tracing::info!("[DeepSeek] Executing bash command (session: {}, dir: {:?}): {}", session_id, work_dir, command);

    // 使用 shell 执行命令
    let mut cmd = if cfg!(target_os = "windows") {
        Command::new("cmd")
    } else {
        Command::new("sh")
    };

    if cfg!(target_os = "windows") {
        cmd.args(["/C", command]);
    } else {
        cmd.arg("-c").arg(command);
    }

    // 设置工作目录
    if let Some(dir) = work_dir {
        cmd.current_dir(dir);
    }

    let output = cmd.output().map_err(|e| {
        tracing::error!("[DeepSeek] Command execution failed: {}", e);
        AppError::ProcessError(e.to_string())
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(BashResult {
        stdout,
        stderr,
        exit_code: output.status.code(),
    })
}

/**
 * 读取文件内容
 *
 * @param path - 文件路径
 */
#[tauri::command]
pub async fn read_file(path: &str) -> Result<String> {
    tracing::info!("[DeepSeek] Reading file: {}", path);

    fs::read_to_string(path).map_err(|e| {
        tracing::error!("[DeepSeek] Failed to read file {}: {}", path, e);
        AppError::IoError(e)
    })
}

/**
 * 写入文件
 *
 * @param path - 文件路径
 * @param content - 文件内容
 */
#[tauri::command]
pub async fn write_file(path: &str, content: &str) -> Result<()> {
    tracing::info!("[DeepSeek] Writing file: {} ({} bytes)", path, content.len());

    // 确保父目录存在
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| {
                tracing::error!("[DeepSeek] Failed to create directory {}: {}", parent.display(), e);
                AppError::Unknown(e.to_string())
            })?;
        }
    }

    fs::write(path, content).map_err(|e| {
        tracing::error!("[DeepSeek] Failed to write file {}: {}", path, e);
        AppError::Unknown(e.to_string())
    })?;

    tracing::info!("[DeepSeek] File written successfully: {}", path);
    Ok(())
}

/**
 * 编辑文件 (精确替换)
 *
 * @param path - 文件路径
 * @param old_str - 要替换的原始文本
 * @param new_str - 替换后的新文本
 */
#[tauri::command]
pub async fn edit_file(
    path: &str,
    old_str: &str,
    new_str: &str,
) -> Result<()> {
    tracing::info!("[DeepSeek] Editing file: {}", path);

    let content = fs::read_to_string(path).map_err(|e| {
        tracing::error!("[DeepSeek] Failed to read file {}: {}", path, e);
        AppError::Unknown(e.to_string())
    })?;

    if !content.contains(old_str) {
        tracing::warn!("[DeepSeek] Old string not found in file: {}", path);
        return Err(AppError::Unknown(format!("Old string not found in file: {}", path)));
    }

    let new_content = content.replace(old_str, new_str);

    fs::write(path, new_content).map_err(|e| {
        tracing::error!("[DeepSeek] Failed to write edited file {}: {}", path, e);
        AppError::Unknown(e.to_string())
    })?;

    tracing::info!("[DeepSeek] File edited successfully: {}", path);
    Ok(())
}

/**
 * 列出目录内容
 *
 * @param path - 目录路径
 * @param recursive - 是否递归
 */
#[tauri::command]
pub async fn list_directory(
    path: &str,
    recursive: bool,
) -> Result<Vec<String>> {
    tracing::info!("[DeepSeek] Listing directory: {} (recursive: {})", path, recursive);

    let mut files = Vec::new();

    if recursive {
        // 递归列出所有文件
        let entries = walkdir::WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file());

        for entry in entries {
            let path = entry.path().display().to_string();
            files.push(path);
        }
    } else {
        // 只列出直接子项
        let entries = fs::read_dir(path).map_err(|e| {
            tracing::error!("[DeepSeek] Failed to read directory {}: {}", path, e);
            AppError::Unknown(e.to_string())
        })?;

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path().display().to_string();
            files.push(path);
        }
    }

    // 排序文件列表
    files.sort();

    tracing::info!("[DeepSeek] Listed {} files", files.len());
    Ok(files)
}

/**
 * Git 状态
 */
#[tauri::command]
pub async fn git_status_deepseek() -> Result<Value> {
    tracing::info!("[DeepSeek] Getting git status");

    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| {
            tracing::error!("[DeepSeek] Git status failed: {}", e);
            AppError::Unknown(e.to_string())
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // 解析 git status 输出
    let files: Vec<Value> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let status = &line[..2.min(line.len())];
            let path = &line[3.min(line.len())..];
            serde_json::json!({
                "status": status,
                "path": path
            })
        })
        .collect();

    Ok(serde_json::json!({ "files": files }))
}

/**
 * Git Diff
 */
#[tauri::command]
pub async fn git_diff_deepseek(
    path: Option<&str>,
    cached: Option<bool>,
) -> Result<String> {
    tracing::info!("[DeepSeek] Getting git diff (path: {:?}, cached: {:?})", path, cached);

    let mut cmd = Command::new("git");
    cmd.arg("diff");

    if cached == Some(true) {
        cmd.arg("--cached");
    }

    if let Some(p) = path {
        cmd.arg(p);
    }

    let output = cmd.output().map_err(|e| {
        tracing::error!("[DeepSeek] Git diff failed: {}", e);
        AppError::Unknown(e.to_string())
    })?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/**
 * Git Log
 */
#[tauri::command]
pub async fn git_log_deepseek(
    max_count: Option<usize>,
) -> Result<String> {
    tracing::info!("[DeepSeek] Getting git log (max_count: {:?})", max_count);

    let count = max_count.unwrap_or(10).to_string();

    let output = Command::new("git")
        .args(["log", "-n", &count, "--pretty=format:%H|%an|%ad|%s", "--date=iso"])
        .output()
        .map_err(|e| {
            tracing::error!("[DeepSeek] Git log failed: {}", e);
            AppError::Unknown(e.to_string())
        })?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
