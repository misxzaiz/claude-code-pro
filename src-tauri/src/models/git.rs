/**
 * Git 数据模型
 *
 * Rust 端的 Git 相关数据结构定义
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Git 文件状态
// ============================================================================

/// Git 文件状态枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitFileStatus {
    Untracked,
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Unmerged,
}

impl From<git2::Status> for GitFileStatus {
    fn from(status: git2::Status) -> Self {
        if status.is_index_new()
            || status.is_index_modified()
            || status.is_index_deleted()
            || status.is_index_renamed()
        {
            match (
                status.is_index_new(),
                status.is_index_deleted(),
                status.is_index_renamed(),
            ) {
                (true, false, false) => GitFileStatus::Added,
                (false, true, false) => GitFileStatus::Deleted,
                (_, _, true) => GitFileStatus::Renamed,
                _ => GitFileStatus::Modified,
            }
        } else if status.is_wt_new() {
            GitFileStatus::Untracked
        } else if status.is_wt_deleted() {
            GitFileStatus::Deleted
        } else if status.is_wt_renamed() {
            GitFileStatus::Renamed
        } else if status.is_wt_modified() {
            GitFileStatus::Modified
        } else if status.is_conflicted() {
            GitFileStatus::Unmerged
        } else {
            GitFileStatus::Modified
        }
    }
}

/// Git 文件变更信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileChange {
    pub path: String,
    pub status: GitFileStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<usize>,
}

// ============================================================================
// Git 仓库状态
// ============================================================================

/// Git 仓库完整状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRepositoryStatus {
    pub exists: bool,
    pub branch: String,
    pub commit: String,
    pub short_commit: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<GitFileChange>,
    pub unstaged: Vec<GitFileChange>,
    pub untracked: Vec<String>,
    pub conflicted: Vec<String>,
    pub is_empty: bool,
}

impl Default for GitRepositoryStatus {
    fn default() -> Self {
        Self {
            exists: false,
            branch: String::new(),
            commit: String::new(),
            short_commit: String::new(),
            ahead: 0,
            behind: 0,
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            conflicted: Vec::new(),
            is_empty: false,
        }
    }
}

// ============================================================================
// Git Diff
// ============================================================================

/// Diff 变更类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffChangeType {
    Added,
    Deleted,
    Modified,
    Renamed,
    Copied,
}

/// Git Diff 条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffEntry {
    pub file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_file_path: Option<String>,
    pub change_type: DiffChangeType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<usize>,
    pub is_binary: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_omitted: Option<bool>,
}

// ============================================================================
// Git 提交
// ============================================================================

/// Git 提交信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    pub parents: Vec<String>,
}

// ============================================================================
// Git 分支
// ============================================================================

/// Git 分支信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub commit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ahead: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behind: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_commit_date: Option<i64>,
}

// ============================================================================
// Git 远程仓库
// ============================================================================

/// Git 远程仓库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRemote {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub push_url: Option<String>,
}

// ============================================================================
// Pull Request
// ============================================================================

/// PR 状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PRState {
    Open,
    Merged,
    Closed,
}

/// PR 审查状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PRReviewStatus {
    Approved,
    ChangesRequested,
    Pending,
    Commented,
}

/// Pull Request 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u64,
    pub url: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub state: PRState,
    pub head_branch: String,
    pub base_branch: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<i64>,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_status: Option<PRReviewStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changed_files: Option<usize>,
}

/// PR 创建选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePROptions {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignees: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
}

// ============================================================================
// Git Host
// ============================================================================

/// Git Host 类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitHostType {
    GitHub,
    GitLab,
    AzureDevOps,
    Bitbucket,
    Unknown,
}

// ============================================================================
// 错误类型
// ============================================================================

/// Git 操作错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for GitError {}

/// Git 服务错误（内部使用）
#[derive(Debug)]
pub enum GitServiceError {
    GitError(git2::Error),
    IoError(std::io::Error),
    NotARepository,
    BranchNotFound(String),
    CommitNotFound(String),
    ConflictsDetected {
        message: String,
        conflicted_files: Vec<String>,
    },
    RebaseInProgress,
    MergeInProgress,
    RemoteNotFound(String),
    CLINotFound(String),
    CLIError(String),
}

impl std::fmt::Display for GitServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::GitError(e) => write!(f, "Git error: {}", e),
            Self::IoError(e) => write!(f, "IO error: {}", e),
            Self::NotARepository => write!(f, "Not a Git repository"),
            Self::BranchNotFound(name) => write!(f, "Branch '{}' not found", name),
            Self::CommitNotFound(sha) => write!(f, "Commit '{}' not found", sha),
            Self::ConflictsDetected {
                message,
                conflicted_files,
            } => {
                write!(f, "Merge conflicts: {}. Files: {:?}", message, conflicted_files)
            }
            Self::RebaseInProgress => write!(f, "Rebase is already in progress"),
            Self::MergeInProgress => write!(f, "Merge is already in progress"),
            Self::RemoteNotFound(name) => write!(f, "Remote '{}' not found", name),
            Self::CLINotFound(cli) => write!(f, "CLI tool '{}' not found", cli),
            Self::CLIError(err) => write!(f, "CLI error: {}", err),
        }
    }
}

impl std::error::Error for GitServiceError {}

impl From<git2::Error> for GitServiceError {
    fn from(err: git2::Error) -> Self {
        Self::GitError(err)
    }
}

impl From<std::io::Error> for GitServiceError {
    fn from(err: std::io::Error) -> Self {
        Self::IoError(err)
    }
}

// ============================================================================
// 分支比较
// ============================================================================

/// 分支比较结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchComparison {
    pub ahead: usize,
    pub behind: usize,
    pub diverged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub common_ancestor: Option<String>,
}

// ============================================================================
// 冲突文件
// ============================================================================

/// 冲突文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictedFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub our_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub their_content: Option<String>,
    pub resolved: bool,
}

// ============================================================================
// Git 操作结果
// ============================================================================

/// 统一的 Git 操作结果
pub type GitResult<T> = Result<T, GitError>;

/// 将 GitServiceError 转换为 GitError
impl From<GitServiceError> for GitError {
    fn from(err: GitServiceError) -> Self {
        let (code, message, details) = match err {
            GitServiceError::GitError(e) => (
                "GIT_ERROR".to_string(),
                e.message().to_string(),
                Some(format!("{:?}", e)),
            ),
            GitServiceError::IoError(e) => (
                "IO_ERROR".to_string(),
                e.to_string(),
                None,
            ),
            GitServiceError::NotARepository => (
                "NOT_A_REPOSITORY".to_string(),
                "Path is not a Git repository".to_string(),
                None,
            ),
            GitServiceError::BranchNotFound(name) => (
                "BRANCH_NOT_FOUND".to_string(),
                format!("Branch '{}' not found", name),
                None,
            ),
            GitServiceError::CommitNotFound(sha) => (
                "COMMIT_NOT_FOUND".to_string(),
                format!("Commit '{}' not found", sha),
                None,
            ),
            GitServiceError::ConflictsDetected {
                message,
                conflicted_files,
            } => (
                "CONFLICTS_DETECTED".to_string(),
                message,
                Some(format!("Conflicted files: {:?}", conflicted_files)),
            ),
            GitServiceError::RebaseInProgress => (
                "REBASE_IN_PROGRESS".to_string(),
                "A rebase is already in progress".to_string(),
                None,
            ),
            GitServiceError::MergeInProgress => (
                "MERGE_IN_PROGRESS".to_string(),
                "A merge is already in progress".to_string(),
                None,
            ),
            GitServiceError::RemoteNotFound(name) => (
                "REMOTE_NOT_FOUND".to_string(),
                format!("Remote '{}' not found", name),
                None,
            ),
            GitServiceError::CLINotFound(cli) => (
                "CLI_NOT_FOUND".to_string(),
                format!("CLI tool '{}' not found in PATH", cli),
                Some("Please install the CLI tool and ensure it's in your PATH".to_string()),
            ),
            GitServiceError::CLIError(err) => (
                "CLI_ERROR".to_string(),
                err,
                None,
            ),
        };

        Self { code, message, details }
    }
}
