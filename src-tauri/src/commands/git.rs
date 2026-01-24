/**
 * Git Tauri Commands
 *
 * 前端调用的 Git 操作命令
 */

use crate::models::git::*;
use crate::services::git::GitService;
use std::path::PathBuf;

/// 检查路径是否为 Git 仓库
#[tauri::command]
pub fn git_is_repository(workspace_path: String) -> Result<bool, GitError> {
    let path = PathBuf::from(workspace_path);
    Ok(GitService::is_repository(&path))
}

/// 初始化 Git 仓库
#[tauri::command]
pub fn git_init_repository(
    workspace_path: String,
    initial_branch: Option<String>,
) -> Result<String, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::init_repository(&path, initial_branch.as_deref())
        .map_err(GitError::from)
}

/// 获取仓库状态
#[tauri::command]
pub fn git_get_status(workspace_path: String) -> Result<GitRepositoryStatus, GitError> {
    eprintln!("[Tauri Command] git_get_status 被调用，路径: {}", workspace_path);

    let path = PathBuf::from(workspace_path);

    match GitService::get_status(&path) {
        Ok(status) => {
            eprintln!("[Tauri Command] git_get_status 成功");
            Ok(status)
        }
        Err(e) => {
            eprintln!("[Tauri Command] git_get_status 失败: {:?}", e);
            Err(GitError::from(e))
        }
    }
}

/// 获取 Diff (HEAD vs 指定 commit)
#[tauri::command]
pub fn git_get_diffs(
    workspace_path: String,
    base_commit: String,
) -> Result<Vec<GitDiffEntry>, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::get_diff(&path, &base_commit).map_err(GitError::from)
}

/// 获取工作区 Diff (未暂存的变更)
#[tauri::command]
pub fn git_get_worktree_diff(workspace_path: String) -> Result<Vec<GitDiffEntry>, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::get_worktree_diff(&path).map_err(GitError::from)
}

/// 获取暂存区 Diff (已暂存的变更)
#[tauri::command]
pub fn git_get_index_diff(workspace_path: String) -> Result<Vec<GitDiffEntry>, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::get_index_diff(&path).map_err(GitError::from)
}

/// 获取所有分支
#[tauri::command]
pub fn git_get_branches(workspace_path: String) -> Result<Vec<GitBranch>, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::get_branches(&path).map_err(GitError::from)
}

/// 创建分支
#[tauri::command]
pub fn git_create_branch(
    workspace_path: String,
    name: String,
    checkout: bool,
) -> Result<(), GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::create_branch(&path, &name, checkout).map_err(GitError::from)
}

/// 切换分支
#[tauri::command]
pub fn git_checkout_branch(workspace_path: String, name: String) -> Result<(), GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::checkout_branch(&path, &name).map_err(GitError::from)
}

/// 提交变更
#[tauri::command]
pub fn git_commit_changes(
    workspace_path: String,
    message: String,
    stage_all: bool,
) -> Result<String, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::commit(&path, &message, stage_all).map_err(GitError::from)
}

/// 暂存文件
#[tauri::command]
pub fn git_stage_file(workspace_path: String, file_path: String) -> Result<(), GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::stage_file(&path, &file_path).map_err(GitError::from)
}

/// 取消暂存文件
#[tauri::command]
pub fn git_unstage_file(workspace_path: String, file_path: String) -> Result<(), GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::unstage_file(&path, &file_path).map_err(GitError::from)
}

/// 丢弃工作区变更
#[tauri::command]
pub fn git_discard_changes(workspace_path: String, file_path: String) -> Result<(), GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::discard_changes(&path, &file_path).map_err(GitError::from)
}

/// 获取远程仓库
#[tauri::command]
pub fn git_get_remotes(workspace_path: String) -> Result<Vec<GitRemote>, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::get_remotes(&path).map_err(GitError::from)
}

/// 检测 Git Host 类型
#[tauri::command]
pub fn git_detect_host(remote_url: String) -> GitHostType {
    GitService::detect_git_host(&remote_url)
}

/// 推送分支到远程
#[tauri::command]
pub fn git_push_branch(
    workspace_path: String,
    branch_name: String,
    remote_name: String,
    force: bool,
) -> Result<(), GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::push_branch(&path, &branch_name, &remote_name, force).map_err(GitError::from)
}

/// 创建 Pull Request
#[tauri::command]
pub fn git_create_pr(
    workspace_path: String,
    options: CreatePROptions,
) -> Result<PullRequest, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::create_pr(&path, &options).map_err(GitError::from)
}

/// 获取 PR 状态
#[tauri::command]
pub fn git_get_pr_status(
    workspace_path: String,
    pr_number: u64,
) -> Result<PullRequest, GitError> {
    let path = PathBuf::from(workspace_path);
    GitService::get_pr_status(&path, pr_number).map_err(GitError::from)
}
