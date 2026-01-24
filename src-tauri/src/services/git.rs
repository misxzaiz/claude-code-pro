/**
 * Git 服务
 *
 * 提供所有 Git 操作的核心功能实现
 */

use crate::models::git::*;
use git2::{
    BranchType, Diff, DiffDelta, DiffOptions, Oid, Repository, StatusOptions,
};
use std::path::Path;

/// 最大内联 Diff 大小 (2MB)
const MAX_INLINE_DIFF_BYTES: usize = 2 * 1024 * 1024;

/// Git 服务
pub struct GitService;

impl GitService {
    // ========================================================================
    // 仓库操作
    // ========================================================================

    /// 检查路径是否为 Git 仓库
    pub fn is_repository(path: &Path) -> bool {
        Repository::open(path).is_ok()
    }

    /// 打开仓库
    fn open_repository(path: &Path) -> Result<Repository, GitServiceError> {
        Repository::open(path).map_err(GitServiceError::from)
    }

    /// 初始化 Git 仓库
    pub fn init_repository(path: &Path, initial_branch: Option<&str>) -> Result<String, GitServiceError> {
        let branch_name = initial_branch.unwrap_or("main");

        let repo = git2::Repository::init_opts(
            path,
            git2::RepositoryInitOptions::new()
                .initial_head(branch_name)
                .mkdir(true),
        )?;

        // 创建初始提交
        let sig = repo.signature()?;
        let tree_id = {
            let tree_builder = repo.treebuilder(None)?;
            tree_builder.write()?
        };
        let tree = repo.find_tree(tree_id)?;

        let oid = repo.commit(
            Some(&format!("refs/heads/{}", branch_name)),
            &sig,
            &sig,
            "Initial commit",
            &tree,
            &[],
        )?;

        Ok(oid.to_string())
    }

    // ========================================================================
    // 状态查询
    // ========================================================================

    /// 获取仓库状态
    pub fn get_status(path: &Path) -> Result<GitRepositoryStatus, GitServiceError> {
        let repo = Self::open_repository(path)?;

        // 检查是否为空仓库
        let is_empty = repo.is_empty()?;

        // 获取 HEAD 信息
        let (branch, commit, short_commit) = if is_empty {
            (String::new(), String::new(), String::new())
        } else {
            let head = repo.head()?;
            let branch_name = head.shorthand().unwrap_or("HEAD").to_string();
            let commit_oid = head.target().ok_or(GitServiceError::NotARepository)?;
            let commit_str = commit_oid.to_string();
            let short_str = commit_str.chars().take(8).collect();
            (branch_name, commit_str, short_str)
        };

        // 计算领先/落后
        let (ahead, behind) = if !is_empty && !branch.is_empty() {
            Self::get_ahead_behind(&repo, &branch)?
        } else {
            (0, 0)
        };

        // 获取文件状态
        let (staged, unstaged, untracked, conflicted) = Self::parse_statuses(&repo)?;

        Ok(GitRepositoryStatus {
            exists: true,
            branch,
            commit,
            short_commit,
            ahead,
            behind,
            staged,
            unstaged,
            untracked,
            conflicted,
            is_empty,
        })
    }

    /// 解析文件状态
    fn parse_statuses(repo: &Repository) -> Result<
        (Vec<GitFileChange>, Vec<GitFileChange>, Vec<String>, Vec<String>),
        GitServiceError,
    > {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .include_ignored(false)
            .recurse_untracked_dirs(true);

        let statuses = repo.statuses(Some(&mut opts))?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();
        let mut conflicted = Vec::new();

        for entry in statuses.iter() {
            let status = entry.status();

            // 获取文件路径
            let path = entry.path().unwrap_or("").to_string();

            if path.is_empty() {
                continue;
            }

            // 检查是否为冲突文件
            if status.is_conflicted() {
                conflicted.push(path.clone());
            }

            // 处理已暂存的变更
            let index_status = if status.is_index_new()
                || status.is_index_modified()
                || status.is_index_deleted()
                || status.is_index_renamed()
            {
                let file_status = GitFileStatus::from(status);
                staged.push(GitFileChange {
                    path: path.clone(),
                    status: file_status.clone(),
                    old_path: None,
                    additions: None,
                    deletions: None,
                });
                true
            } else {
                false
            };

            // 处理工作区变更
            if status.is_wt_new()
                || status.is_wt_modified()
                || status.is_wt_deleted()
                || status.is_wt_renamed()
            {
                if !index_status {
                    // 只在工作区有变更时添加
                    let file_status = GitFileStatus::from(status);
                    if file_status == GitFileStatus::Untracked {
                        untracked.push(path);
                    } else {
                        unstaged.push(GitFileChange {
                            path: path.clone(),
                            status: file_status,
                            old_path: None,
                            additions: None,
                            deletions: None,
                        });
                    }
                }
            }
        }

        Ok((staged, unstaged, untracked, conflicted))
    }

    /// 计算分支的领先/落后
    fn get_ahead_behind(repo: &Repository, branch_name: &str) -> Result<(usize, usize), GitServiceError> {
        let branch = repo
            .find_branch(branch_name, BranchType::Local)
            .or_else(|_| repo.find_branch(branch_name, BranchType::Remote))?;

        // 尝试获取上游分支
        let upstream = branch.upstream();

        if let Ok(upstream_branch) = upstream {
            let branch_oid = branch.get().target()
                .ok_or(GitServiceError::BranchNotFound(branch_name.to_string()))?;
            let upstream_oid = upstream_branch.get().target()
                .ok_or(GitServiceError::BranchNotFound("upstream".to_string()))?;

            Ok(repo.graph_ahead_behind(branch_oid, upstream_oid)?)
        } else {
            Ok((0, 0))
        }
    }

    // ========================================================================
    // Diff 操作
    // ========================================================================

    /// 获取 Diff（HEAD vs 指定 commit）
    pub fn get_diff(path: &Path, base_commit: &str) -> Result<Vec<GitDiffEntry>, GitServiceError> {
        // 解析基准 commit - 先打开仓库获取这些信息
        let repo = Self::open_repository(path)?;

        let base_oid = Oid::from_str(base_commit)
            .map_err(|_| GitServiceError::CommitNotFound(base_commit.to_string()))?;
        let base_commit_obj = repo.find_commit(base_oid)
            .map_err(|_| GitServiceError::CommitNotFound(base_commit.to_string()))?;
        let base_tree = base_commit_obj.tree()?;

        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        // 计算 Diff
        let mut diff_opts = DiffOptions::new();
        diff_opts.include_typechange(true);

        let diff = repo.diff_tree_to_tree(
            Some(&base_tree),
            Some(&head_tree),
            Some(&mut diff_opts),
        )?;

        // 重新打开仓库用于 convert_diff（避免借用问题）
        let repo2 = Self::open_repository(path)?;
        Self::convert_diff(repo2, diff)
    }

    /// 获取工作区 Diff（未暂存的变更）
    pub fn get_worktree_diff(path: &Path) -> Result<Vec<GitDiffEntry>, GitServiceError> {
        let repo = Self::open_repository(path)?;

        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        let diff = repo.diff_tree_to_workdir(Some(&head_tree), None)?;

        // 重新打开仓库用于 convert_diff（避免借用问题）
        let repo2 = Self::open_repository(path)?;
        Self::convert_diff(repo2, diff)
    }

    /// 获取暂存区 Diff（已暂存的变更）
    pub fn get_index_diff(path: &Path) -> Result<Vec<GitDiffEntry>, GitServiceError> {
        let repo = Self::open_repository(path)?;

        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        let diff = repo.diff_tree_to_index(Some(&head_tree), None, None)?;

        // 重新打开仓库用于 convert_diff（避免借用问题）
        let repo2 = Self::open_repository(path)?;
        Self::convert_diff(repo2, diff)
    }

    /// 将 git2::Diff 转换为 GitDiffEntry
    fn convert_diff(repo: Repository, diff: Diff) -> Result<Vec<GitDiffEntry>, GitServiceError> {
        let mut entries = Vec::new();

        for delta in diff.deltas() {
            // 使用 DiffDelta API 获取文件路径
            let new_path = delta.new_file().path();
            let old_path = delta.old_file().path();

            let file_path = new_path
                .or(old_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            let old_file_path = if delta.status() == git2::Delta::Renamed || delta.status() == git2::Delta::Copied {
                old_path.map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            let change_type = match delta.status() {
                git2::Delta::Added => DiffChangeType::Added,
                git2::Delta::Deleted => DiffChangeType::Deleted,
                git2::Delta::Modified => DiffChangeType::Modified,
                git2::Delta::Renamed => DiffChangeType::Renamed,
                git2::Delta::Copied => DiffChangeType::Copied,
                _ => DiffChangeType::Modified,
            };

            // 计算行数变化
            let (additions, deletions) = Self::compute_line_stats(&diff, &delta);

            // 检查是否为二进制文件
            let is_binary = delta.new_file().is_binary() || delta.old_file().is_binary();

            // 获取文件内容（如果不是二进制且不太大）
            let (old_content, new_content, content_omitted) = if is_binary {
                (None, None, Some(true))
            } else {
                Self::get_diff_content(&repo, &delta, &change_type)?
            };

            entries.push(GitDiffEntry {
                file_path: file_path.clone(),
                old_file_path,
                change_type,
                old_content,
                new_content,
                additions: Some(additions),
                deletions: Some(deletions),
                is_binary,
                content_omitted,
            });
        }

        Ok(entries)
    }

    /// 计算增删行数
    /// 注意：git2 0.18 版本的 Diff API 较为复杂，这里暂时返回 (0, 0)
    /// 可以通过后续分析 diff 内容来准确计算
    fn compute_line_stats(_diff: &Diff, _delta: &DiffDelta) -> (usize, usize) {
        // TODO: 实现准确的行数统计
        (0, 0)
    }

    /// 获取 Diff 的文件内容
    fn get_diff_content(
        repo: &Repository,
        delta: &DiffDelta,
        change_type: &DiffChangeType,
    ) -> Result<(Option<String>, Option<String>, Option<bool>), GitServiceError> {
        let old_content = if !matches!(change_type, DiffChangeType::Added) {
            let oid = delta.old_file().id();
            if !oid.is_zero() {
                match repo.find_blob(oid) {
                    Ok(blob) => {
                        if blob.size() > MAX_INLINE_DIFF_BYTES {
                            Some(None)
                        } else if blob.is_binary() {
                            Some(None)
                        } else {
                            Some(std::str::from_utf8(blob.content()).ok().map(|s| s.to_string()))
                        }
                    }
                    Err(_) => Some(None),
                }
            } else {
                Some(None)
            }
        } else {
            Some(None)
        };

        let new_content = if !matches!(change_type, DiffChangeType::Deleted) {
            let oid = delta.new_file().id();
            if !oid.is_zero() {
                match repo.find_blob(oid) {
                    Ok(blob) => {
                        if blob.size() > MAX_INLINE_DIFF_BYTES {
                            Some(None)
                        } else if blob.is_binary() {
                            Some(None)
                        } else {
                            Some(std::str::from_utf8(blob.content()).ok().map(|s| s.to_string()))
                        }
                    }
                    Err(_) => Some(None),
                }
            } else {
                Some(None)
            }
        } else {
            Some(None)
        };

        // 计算是否省略内容（使用 as_ref 避免移动）
        let content_omitted = old_content.as_ref().is_some_and(|o| o.is_none())
            || new_content.as_ref().is_some_and(|n| n.is_none());

        // 提取内容
        let old = old_content.and_then(|o| o);
        let new = new_content.and_then(|n| n);

        Ok((
            old,
            new,
            if content_omitted { Some(true) } else { None },
        ))
    }

    // ========================================================================
    // 分支操作
    // ========================================================================

    /// 获取所有分支
    pub fn get_branches(path: &Path) -> Result<Vec<GitBranch>, GitServiceError> {
        let repo = Self::open_repository(path)?;

        let current_branch = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()))
            .unwrap_or_default();

        let mut branches = Vec::new();

        // 本地分支
        let local_branches = repo.branches(Some(BranchType::Local))?;
        for branch_result in local_branches {
            let (branch, _) = branch_result?;
            if let Some(name) = branch.name()? {
                let commit_oid = branch.get().target().unwrap_or(git2::Oid::zero());
                let commit = repo.find_commit(commit_oid);

                let last_commit_date = commit.ok().and_then(|c| {
                    let time = c.time();
                    Some(i64::from(time.seconds()))
                });

                branches.push(GitBranch {
                    name: name.to_string(),
                    is_current: name == current_branch,
                    is_remote: false,
                    commit: commit_oid.to_string(),
                    ahead: None,
                    behind: None,
                    last_commit_date,
                });
            }
        }

        // 远程分支
        let remote_branches = repo.branches(Some(BranchType::Remote))?;
        for branch_result in remote_branches {
            let (branch, _) = branch_result?;
            if let Some(name) = branch.name()? {
                // 跳过远程 HEAD 引用
                if !name.ends_with("/HEAD") {
                    let commit_oid = branch.get().target().unwrap_or(git2::Oid::zero());

                    branches.push(GitBranch {
                        name: name.to_string(),
                        is_current: false,
                        is_remote: true,
                        commit: commit_oid.to_string(),
                        ahead: None,
                        behind: None,
                        last_commit_date: None,
                    });
                }
            }
        }

        Ok(branches)
    }

    /// 创建分支
    pub fn create_branch(
        path: &Path,
        name: &str,
        checkout: bool,
    ) -> Result<(), GitServiceError> {
        let repo = Self::open_repository(path)?;

        let head = repo.head()?.peel_to_commit()?;

        // 验证分支名
        if !git2::Branch::name_is_valid(name).unwrap_or(false) {
            return Err(GitServiceError::BranchNotFound(format!(
                "Invalid branch name: {}",
                name
            )));
        }

        repo.branch(name, &head, false)?;

        if checkout {
            // 切换到新分支
            let obj = repo.revparse_single(&format!("refs/heads/{}", name))?;
            repo.checkout_tree(&obj, None)?;
            repo.set_head(&format!("refs/heads/{}", name))?;
        }

        Ok(())
    }

    /// 切换分支
    pub fn checkout_branch(path: &Path, name: &str) -> Result<(), GitServiceError> {
        let repo = Self::open_repository(path)?;

        let obj = repo.revparse_single(name)?;
        repo.checkout_tree(&obj, None)?;
        repo.set_head(&format!("refs/heads/{}", name))?;

        Ok(())
    }

    // ========================================================================
    // 提交操作
    // ========================================================================

    /// 提交变更
    pub fn commit(path: &Path, message: &str, stage_all: bool) -> Result<String, GitServiceError> {
        let repo = Self::open_repository(path)?;

        let mut index = repo.index()?;

        if stage_all {
            // 添加所有变更到暂存区
            index.add_all(["*"], git2::IndexAddOption::DEFAULT, None)?;
        }

        // 检查是否有变更
        if index.is_empty() {
            return Err(GitServiceError::CLIError("No changes to commit".to_string()));
        }

        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        let sig = repo.signature()?;

        let head = repo.head()?;
        let parent_commit = head.peel_to_commit()?;

        let oid = repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &[&parent_commit],
        )?;

        Ok(oid.to_string())
    }

    /// 暂存文件
    pub fn stage_file(path: &Path, file_path: &str) -> Result<(), GitServiceError> {
        let repo = Self::open_repository(path)?;

        let mut index = repo.index()?;
        index.add_path(std::path::Path::new(file_path))?;
        index.write()?;

        Ok(())
    }

    /// 取消暂存文件
    pub fn unstage_file(path: &Path, file_path: &str) -> Result<(), GitServiceError> {
        let repo = Self::open_repository(path)?;

        let mut index = repo.index()?;
        index.remove_path(std::path::Path::new(file_path))?;
        index.write()?;

        Ok(())
    }

    /// 丢弃工作区变更
    pub fn discard_changes(path: &Path, file_path: &str) -> Result<(), GitServiceError> {
        let repo = Self::open_repository(path)?;

        let mut index = repo.index()?;

        // 从 HEAD 恢复文件
        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        let entry = head_tree.get_path(std::path::Path::new(file_path))?;

        let obj = entry.to_object(&repo)?;
        let blob = obj.as_blob().ok_or(GitServiceError::CLIError(
            "Not a blob".to_string(),
        ))?;

        // 写入文件
        let workdir = repo.workdir().ok_or(GitServiceError::NotARepository)?;
        let full_path = workdir.join(file_path);

        std::fs::write(&full_path, blob.content())?;

        // 更新索引
        index.add_path(std::path::Path::new(file_path))?;
        index.write()?;

        Ok(())
    }

    // ========================================================================
    // 远程操作
    // ========================================================================

    /// 获取远程仓库
    pub fn get_remotes(path: &Path) -> Result<Vec<GitRemote>, GitServiceError> {
        let repo = Self::open_repository(path)?;

        let mut remotes = Vec::new();

        for remote in repo.remotes()?.iter() {
            if let Some(name) = remote {
                let remote = repo.find_remote(name)?;
                remotes.push(GitRemote {
                    name: name.to_string(),
                    fetch_url: remote.url().map(|s: &str| s.to_string()),
                    push_url: remote.pushurl().map(|s: &str| s.to_string()),
                });
            }
        }

        Ok(remotes)
    }

    /// 检测 Git Host 类型
    pub fn detect_git_host(remote_url: &str) -> GitHostType {
        if remote_url.contains("github.com") {
            GitHostType::GitHub
        } else if remote_url.contains("gitlab.com") {
            GitHostType::GitLab
        } else if remote_url.contains("dev.azure.com")
            || remote_url.contains("visualstudio.com")
        {
            GitHostType::AzureDevOps
        } else if remote_url.contains("bitbucket.org") {
            GitHostType::Bitbucket
        } else {
            GitHostType::Unknown
        }
    }

    // ========================================================================
    // PR 操作（通过 CLI）
    // ========================================================================

    /// 推送分支到远程
    pub fn push_branch(
        path: &Path,
        branch_name: &str,
        remote_name: &str,
        force: bool,
    ) -> Result<(), GitServiceError> {
        let output = std::process::Command::new("git")
            .arg("push")
            .arg(remote_name)
            .arg(branch_name)
            .arg(if force { "--force" } else { "--force-with-lease" })
            .current_dir(path)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitServiceError::CLIError(stderr.to_string()));
        }

        Ok(())
    }

    /// 创建 Pull Request
    pub fn create_pr(
        path: &Path,
        options: &CreatePROptions,
    ) -> Result<PullRequest, GitServiceError> {
        let remote_url = Self::get_remote_url(path, "origin")?;
        let host = Self::detect_git_host(&remote_url);

        match host {
            GitHostType::GitHub => Self::create_github_pr(path, options),
            GitHostType::GitLab => Self::create_gitlab_pr(path, options),
            GitHostType::AzureDevOps => Self::create_azure_pr(path, options),
            GitHostType::Bitbucket => Self::create_bitbucket_pr(path, options),
            GitHostType::Unknown => Err(GitServiceError::CLIError(
                "Unsupported Git host".to_string(),
            )),
        }
    }

    /// 获取远程 URL
    fn get_remote_url(path: &Path, remote_name: &str) -> Result<String, GitServiceError> {
        let repo = Self::open_repository(path)?;

        let remote = repo
            .find_remote(remote_name)
            .map_err(|_| GitServiceError::RemoteNotFound(remote_name.to_string()))?;

        remote
            .url()
            .ok_or_else(|| GitServiceError::CLIError("Remote has no URL".to_string()))
            .map(|s| s.to_string())
    }

    /// 使用 gh CLI 创建 GitHub PR
    fn create_github_pr(
        path: &Path,
        options: &CreatePROptions,
    ) -> Result<PullRequest, GitServiceError> {
        // 检查 gh 是否可用
        let check = std::process::Command::new("gh")
            .arg("--version")
            .output();

        if check.is_err() || !check.ok().map(|o| o.status.success()).unwrap_or(false) {
            return Err(GitServiceError::CLINotFound("gh".to_string()));
        }

        let mut cmd = std::process::Command::new("gh");
        cmd.arg("pr")
            .arg("create")
            .arg("--title")
            .arg(&options.title)
            .arg("--base")
            .arg(&options.base_branch)
            .arg("--head")
            .arg(&options.head_branch)
            .arg("--json")
            .arg("number,state,title,body,url,headRefName,baseRefName,createdAt,mergedAt,closedAt,author,additions,deletions,changedFiles");

        if let Some(body) = &options.body {
            cmd.arg("--body").arg(body);
        }

        if options.draft.unwrap_or(false) {
            cmd.arg("--draft");
        }

        if let Some(assignees) = &options.assignees {
            for assignee in assignees {
                cmd.arg("--assignee").arg(assignee);
            }
        }

        if let Some(labels) = &options.labels {
            for label in labels {
                cmd.arg("--label").arg(label);
            }
        }

        let output = cmd.current_dir(path).output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitServiceError::CLIError(stderr.to_string()));
        }

        // 解析 JSON 输出
        let json = String::from_utf8_lossy(&output.stdout);
        let pr_data: serde_json::Value = serde_json::from_str(&json)
            .map_err(|e| GitServiceError::CLIError(format!("Failed to parse PR info: {}", e)))?;

        Ok(PullRequest {
            number: pr_data["number"]
                .as_u64()
                .ok_or_else(|| GitServiceError::CLIError("Missing PR number".to_string()))?,
            url: pr_data["url"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing PR URL".to_string()))?
                .to_string(),
            title: pr_data["title"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing PR title".to_string()))?
                .to_string(),
            body: pr_data["body"].as_str().map(|s| s.to_string()),
            state: match pr_data["state"].as_str().unwrap_or("open") {
                "OPEN" => PRState::Open,
                "MERGED" => PRState::Merged,
                "CLOSED" => PRState::Closed,
                _ => PRState::Open,
            },
            head_branch: pr_data["headRefName"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing head branch".to_string()))?
                .to_string(),
            base_branch: pr_data["baseRefName"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing base branch".to_string()))?
                .to_string(),
            created_at: pr_data["createdAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp())
                .unwrap_or(0),
            updated_at: pr_data["createdAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp())
                .unwrap_or(0),
            merged_at: pr_data["mergedAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp()),
            closed_at: pr_data["closedAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp()),
            author: pr_data["author"]
                .as_object()
                .and_then(|o| o.get("login"))
                .and_then(|l| l.as_str())
                .unwrap_or("unknown")
                .to_string(),
            review_status: None,
            additions: pr_data["additions"].as_u64().map(|v| v as usize),
            deletions: pr_data["deletions"].as_u64().map(|v| v as usize),
            changed_files: pr_data["changedFiles"].as_u64().map(|v| v as usize),
        })
    }

    /// 使用 git CLI 创建 GitLab MR（暂不支持）
    fn create_gitlab_pr(
        _path: &Path,
        _options: &CreatePROptions,
    ) -> Result<PullRequest, GitServiceError> {
        Err(GitServiceError::CLIError(
            "GitLab MR creation not yet supported".to_string(),
        ))
    }

    /// 使用 az CLI 创建 Azure DevOps PR（暂不支持）
    fn create_azure_pr(
        _path: &Path,
        _options: &CreatePROptions,
    ) -> Result<PullRequest, GitServiceError> {
        Err(GitServiceError::CLIError(
            "Azure DevOps PR creation not yet supported".to_string(),
        ))
    }

    /// 使用 git CLI 创建 Bitbucket PR（暂不支持）
    fn create_bitbucket_pr(
        _path: &Path,
        _options: &CreatePROptions,
    ) -> Result<PullRequest, GitServiceError> {
        Err(GitServiceError::CLIError(
            "Bitbucket PR creation not yet supported".to_string(),
        ))
    }

    /// 获取 PR 状态
    pub fn get_pr_status(
        path: &Path,
        pr_number: u64,
    ) -> Result<PullRequest, GitServiceError> {
        let remote_url = Self::get_remote_url(path, "origin")?;
        let host = Self::detect_git_host(&remote_url);

        match host {
            GitHostType::GitHub => Self::get_github_pr_status(path, pr_number),
            _ => Err(GitServiceError::CLIError(
                "PR status check not supported for this host".to_string(),
            )),
        }
    }

    /// 获取 GitHub PR 状态
    fn get_github_pr_status(
        path: &Path,
        pr_number: u64,
    ) -> Result<PullRequest, GitServiceError> {
        let output = std::process::Command::new("gh")
            .arg("pr")
            .arg("view")
            .arg(pr_number.to_string())
            .arg("--json")
            .arg("number,state,title,body,url,headRefName,baseRefName,createdAt,mergedAt,closedAt,author,additions,deletions,changedFiles,reviews")
            .current_dir(path)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitServiceError::CLIError(stderr.to_string()));
        }

        let json = String::from_utf8_lossy(&output.stdout);
        let pr_data: serde_json::Value = serde_json::from_str(&json)
            .map_err(|e| GitServiceError::CLIError(format!("Failed to parse PR info: {}", e)))?;

        // 解析审查状态
        let review_status = pr_data["reviews"]
            .as_array()
            .and_then(|reviews| {
                reviews.last().and_then(|latest| {
                    latest["state"].as_str().map(|s| match s {
                        "APPROVED" => PRReviewStatus::Approved,
                        "CHANGES_REQUESTED" => PRReviewStatus::ChangesRequested,
                        "COMMENTED" => PRReviewStatus::Commented,
                        "PENDING" => PRReviewStatus::Pending,
                        _ => PRReviewStatus::Pending,
                    })
                })
            });

        Ok(PullRequest {
            number: pr_data["number"]
                .as_u64()
                .ok_or_else(|| GitServiceError::CLIError("Missing PR number".to_string()))?,
            url: pr_data["url"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing PR URL".to_string()))?
                .to_string(),
            title: pr_data["title"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing PR title".to_string()))?
                .to_string(),
            body: pr_data["body"].as_str().map(|s| s.to_string()),
            state: match pr_data["state"].as_str().unwrap_or("open") {
                "OPEN" => PRState::Open,
                "MERGED" => PRState::Merged,
                "CLOSED" => PRState::Closed,
                _ => PRState::Open,
            },
            head_branch: pr_data["headRefName"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing head branch".to_string()))?
                .to_string(),
            base_branch: pr_data["baseRefName"]
                .as_str()
                .ok_or_else(|| GitServiceError::CLIError("Missing base branch".to_string()))?
                .to_string(),
            created_at: pr_data["createdAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp())
                .unwrap_or(0),
            updated_at: pr_data["createdAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp())
                .unwrap_or(0),
            merged_at: pr_data["mergedAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp()),
            closed_at: pr_data["closedAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp()),
            author: pr_data["author"]
                .as_object()
                .and_then(|o| o.get("login"))
                .and_then(|l| l.as_str())
                .unwrap_or("unknown")
                .to_string(),
            review_status,
            additions: pr_data["additions"].as_u64().map(|v| v as usize),
            deletions: pr_data["deletions"].as_u64().map(|v| v as usize),
            changed_files: pr_data["changedFiles"].as_u64().map(|v| v as usize),
        })
    }
}
