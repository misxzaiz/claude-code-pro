/**
 * Git 服务
 *
 * 提供所有 Git 操作的核心功能实现
 */

use crate::models::git::*;
use git2::{
    BranchType, Diff, DiffDelta, DiffOptions, Oid, Repository, StatusOptions, IndexAddOption,
};
use std::path::Path;
use std::collections::HashMap;

/// 最大内联 Diff 大小 (2MB)
const MAX_INLINE_DIFF_BYTES: usize = 2 * 1024 * 1024;

/// 文件状态信息（用于合并多个 Git 状态条目）
struct FileStatusInfo {
    path: String,
    index_new: bool,
    index_modified: bool,
    index_deleted: bool,
    index_renamed: bool,
    wt_new: bool,
    wt_modified: bool,
    wt_deleted: bool,
    wt_renamed: bool,
    conflicted: bool,
}

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
        eprintln!("[GitService] get_status 开始，路径: {:?}", path);

        let repo = match Self::open_repository(path) {
            Ok(r) => {
                eprintln!("[GitService] 仓库打开成功");
                r
            }
            Err(e) => {
                eprintln!("[GitService] 仓库打开失败: {:?}", e);
                return Err(e);
            }
        };

        // 检查是否为空仓库
        let is_empty = repo.is_empty()?;
        eprintln!("[GitService] 仓库是否为空: {}", is_empty);

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

    /// 解析文件状态（重构版：合并多状态条目）
    fn parse_statuses(repo: &Repository) -> Result<
        (Vec<GitFileChange>, Vec<GitFileChange>, Vec<String>, Vec<String>),
        GitServiceError,
    > {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .include_ignored(false)
            .recurse_untracked_dirs(true);

        let statuses = repo.statuses(Some(&mut opts))?;

        // 使用 HashMap 合并同一文件的多个状态条目
        let mut file_map: HashMap<String, FileStatusInfo> = HashMap::new();

        for entry in statuses.iter() {
            let status = entry.status();
            let path = entry.path().unwrap_or("").to_string();

            if path.is_empty() {
                continue;
            }

            eprintln!("[DEBUG] 处理文件: {}, status: {:?}", path, status);
            eprintln!("[DEBUG]  索引: new={} modified={} deleted={} renamed={}",
                status.is_index_new(), status.is_index_modified(),
                status.is_index_deleted(), status.is_index_renamed());
            eprintln!("[DEBUG]  工作区: new={} modified={} deleted={} renamed={}",
                status.is_wt_new(), status.is_wt_modified(),
                status.is_wt_deleted(), status.is_wt_renamed());

            // 获取或创建文件状态信息
            let info = file_map.entry(path.clone()).or_insert_with(|| FileStatusInfo {
                path: path.clone(),
                index_new: false,
                index_modified: false,
                index_deleted: false,
                index_renamed: false,
                wt_new: false,
                wt_modified: false,
                wt_deleted: false,
                wt_renamed: false,
                conflicted: status.is_conflicted(),
            });

            // 合并索引状态
            if status.is_index_new() { info.index_new = true; }
            if status.is_index_modified() { info.index_modified = true; }
            if status.is_index_deleted() { info.index_deleted = true; }
            if status.is_index_renamed() { info.index_renamed = true; }

            // 合并工作区状态
            if status.is_wt_new() { info.wt_new = true; }
            if status.is_wt_modified() { info.wt_modified = true; }
            if status.is_wt_deleted() { info.wt_deleted = true; }
            if status.is_wt_renamed() { info.wt_renamed = true; }
            if status.is_conflicted() { info.conflicted = true; }
        }

        // 根据合并后的状态进行分类
        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();
        let mut conflicted = Vec::new();

        for (_path, info) in file_map.into_iter() {
            eprintln!("[DEBUG] 分类文件: {}", info.path);
            eprintln!("[DEBUG]   索引状态: new={} mod={} del={} ren={}",
                info.index_new, info.index_modified, info.index_deleted, info.index_renamed);
            eprintln!("[DEBUG]   工作区状态: new={} mod={} del={} ren={}",
                info.wt_new, info.wt_modified, info.wt_deleted, info.wt_renamed);

            // 冲突文件优先处理
            if info.conflicted {
                conflicted.push(info.path.clone());
            }

            // === 已暂存区分类逻辑 ===
            // 如果文件在索引中有任何变更，则加入 staged 列表
            if info.index_new || info.index_modified || info.index_deleted || info.index_renamed {
                let status = if info.index_new {
                    GitFileStatus::Added
                } else if info.index_deleted {
                    GitFileStatus::Deleted
                } else if info.index_renamed {
                    GitFileStatus::Renamed
                } else {
                    GitFileStatus::Modified
                };

                eprintln!("[DEBUG]   -> 加入 staged (状态: {:?})", status);
                staged.push(GitFileChange {
                    path: info.path.clone(),
                    status,
                    old_path: None,
                    additions: None,
                    deletions: None,
                });
            }

            // === 未暂存区分类逻辑 ===
            // 关键：即使文件在索引中有变更，只要工作区也有变更，也要在 unstaged 中显示
            if info.wt_new || info.wt_modified || info.wt_deleted || info.wt_renamed {
                // 如果是纯新增文件（untracked），放入 untracked
                if info.wt_new && !info.index_new && !info.index_modified && !info.index_deleted {
                    untracked.push(info.path.clone());
                    eprintln!("[DEBUG]   -> 加入 untracked (纯新增)");
                } else {
                    // 其他情况都视为修改，加入 unstaged
                    // 这包括：
                    // 1. 暂存区删除 + 工作区新增（如 11.md 的情况）
                    // 2. 暂存区修改 + 工作区修改
                    // 3. 纯工作区修改
                    let status = if info.wt_new {
                        GitFileStatus::Added
                    } else if info.wt_deleted {
                        GitFileStatus::Deleted
                    } else if info.wt_renamed {
                        GitFileStatus::Renamed
                    } else {
                        GitFileStatus::Modified
                    };

                    eprintln!("[DEBUG]   -> 加入 unstaged (状态: {:?})", status);
                    unstaged.push(GitFileChange {
                        path: info.path.clone(),
                        status,
                        old_path: None,
                        additions: None,
                        deletions: None,
                    });
                }
            }
        }

        eprintln!("[DEBUG] parse_statuses 完成:");
        eprintln!("[DEBUG]   staged: {} 个", staged.len());
        eprintln!("[DEBUG]   unstaged: {} 个", unstaged.len());
        eprintln!("[DEBUG]   untracked: {} 个", untracked.len());
        eprintln!("[DEBUG]   conflicted: {} 个", conflicted.len());
        eprintln!("[DEBUG]   staged paths: {:?}", staged.iter().map(|f| &f.path).collect::<Vec<_>>());
        eprintln!("[DEBUG]   unstaged paths: {:?}", unstaged.iter().map(|f| &f.path).collect::<Vec<_>>());
        eprintln!("[DEBUG]   untracked paths: {:?}", untracked);

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

    /// 获取单个文件在工作区的 Diff（智能版）
    pub fn get_worktree_file_diff(path: &Path, file_path: &str) -> Result<GitDiffEntry, GitServiceError> {
        let repo = Self::open_repository(path)?;

        // 1. 获取文件的详细状态
        let mut status_opts = StatusOptions::new();
        status_opts.pathspec(file_path);
        status_opts.include_untracked(true);

        let statuses = repo.statuses(Some(&mut status_opts))?;

        if let Some(entry) = statuses.iter().next() {
            let status = entry.status();

            // DEBUG: 输出状态信息
            eprintln!("[DEBUG] 文件: {}, 状态: {:?}", file_path, status);
            eprintln!("[DEBUG] is_index_deleted: {}, is_wt_new: {}, is_wt_modified: {}",
                status.is_index_deleted(),
                status.is_wt_new(),
                status.is_wt_modified()
            );

            // 2. 检查特殊冲突情况
            if status.is_index_deleted() {
                // 情况：暂存区标记为删除
                let workdir = repo.workdir().ok_or(GitServiceError::NotARepository)?;
                let full_path = workdir.join(file_path);

                eprintln!("[DEBUG] 检测到暂存区删除，检查工作区文件: {:?}", full_path);

                if full_path.exists() {
                    eprintln!("[DEBUG] 工作区文件存在，使用直接对比");
                    // 子情况：暂存区删除 + 工作区存在
                    // 直接比较 HEAD 和工作区
                    return Self::get_diff_head_to_workdir_direct(&repo, file_path);
                }
            } else if status.is_index_modified() && status.is_wt_modified() {
                // 情况：暂存区修改 + 工作区修改
                // 应该比较：暂存区 vs 工作区
                return Self::get_diff_index_to_workdir(&repo, file_path);
            }
        }

        // 3. 正常情况：使用标准 diff API
        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        let mut diffopts = DiffOptions::new();
        diffopts.pathspec(file_path);
        diffopts.ignore_case(false);

        let diff = repo.diff_tree_to_workdir(Some(&head_tree), Some(&mut diffopts))?;

        // 重新打开仓库用于 convert_diff（避免借用问题）
        let repo2 = Self::open_repository(path)?;
        let entries = Self::convert_diff(repo2, diff)?;
        entries.into_iter().next().ok_or_else(|| {
            GitServiceError::CLIError(format!("文件 {} 没有变更", file_path))
        })
    }

    /// 获取单个文件在暂存区的 Diff
    pub fn get_index_file_diff(path: &Path, file_path: &str) -> Result<GitDiffEntry, GitServiceError> {
        let repo = Self::open_repository(path)?;

        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        // 创建 DiffOptions 并指定路径
        let mut diffopts = DiffOptions::new();
        diffopts.pathspec(file_path);
        diffopts.ignore_case(false);

        let diff = repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut diffopts))?;

        // 重新打开仓库用于 convert_diff（避免借用问题）
        let repo2 = Self::open_repository(path)?;
        let entries = Self::convert_diff(repo2, diff)?;
        entries.into_iter().next().ok_or_else(|| {
            GitServiceError::CLIError(format!("文件 {} 没有变更", file_path))
        })
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
                status_hint: None,  // 正常情况没有冲突提示
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

        // 修复：当 OID 为零时（工作区文件），从文件系统读取
        let new_content = if !matches!(change_type, DiffChangeType::Deleted) {
            let oid = delta.new_file().id();
            if !oid.is_zero() {
                // 从 Git blob 读取（暂存区的情况）
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
                // OID 为零，尝试从工作区读取文件
                if let Some(path) = delta.new_file().path() {
                    let workdir = repo.workdir().ok_or(GitServiceError::NotARepository)?;
                    let full_path = workdir.join(path);


                    // 检查文件大小
                    let metadata = std::fs::metadata(&full_path);
                    if let Ok(meta) = metadata {
                        if meta.len() > MAX_INLINE_DIFF_BYTES as u64 {
                            Some(None)
                        } else {
                            // 读取文件内容
                            match std::fs::read_to_string(&full_path) {
                                Ok(content) => {
                                    // 简单的二进制检查
                                    if Self::is_text_content(&content) {
                                        Some(Some(content))
                                    } else {
                                        Some(None)
                                    }
                                }
                                Err(e) => {
                                    Some(None)
                                }
                            }
                        }
                    } else {
                        Some(None)
                    }
                } else {
                    Some(None)
                }
            }
        } else {
            Some(None)
        };

        // 计算是否省略内容（使用 as_ref 避免移动）
        let content_omitted = old_content.as_ref().map(|o| o.is_none()).unwrap_or(false)
            || new_content.as_ref().map(|n| n.is_none()).unwrap_or(false);

        // 提取内容
        let old = old_content.and_then(|o| o);
        let new = new_content.and_then(|n| n);

        Ok((
            old,
            new,
            if content_omitted { Some(true) } else { None },
        ))
    }

    /// 简单检查内容是否为文本
    fn is_text_content(content: &str) -> bool {
        // 检查前 1000 个字节中是否包含过多的 null 字节或其他二进制特征
        const MAX_SAMPLE_SIZE: usize = 1000;
        let sample = content.chars().take(MAX_SAMPLE_SIZE).collect::<String>();

        // 如果 null 字节超过 1%，认为是二进制
        let null_count = sample.chars().filter(|&c| c == '\0').count();
        let null_ratio = null_count as f64 / sample.len() as f64;

        null_ratio < 0.01 && !sample.contains('\u{FFFD}') // 不包含替换字符
    }

    /// 直接比较 HEAD 和工作区（绕过暂存区）
    fn get_diff_head_to_workdir_direct(
        repo: &Repository,
        file_path: &str,
    ) -> Result<GitDiffEntry, GitServiceError> {

        // 1. 获取 HEAD 内容
        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        let old_content = if let Ok(entry) = head_tree.get_path(std::path::Path::new(file_path)) {
            let obj = entry.to_object(&repo)?;
            if let Some(blob) = obj.as_blob() {
                if blob.size() > MAX_INLINE_DIFF_BYTES {
                    None
                } else if blob.is_binary() {
                    None
                } else {
                    std::str::from_utf8(blob.content()).ok().map(|s| s.to_string())
                }
            } else {
                None
            }
        } else {
            None
        };

        // 2. 读取工作区内容
        let workdir = repo.workdir().ok_or(GitServiceError::NotARepository)?;
        let full_path = workdir.join(file_path);

        let (new_content, is_binary) = if full_path.exists() {
            let metadata = std::fs::metadata(&full_path)?;
            if metadata.len() > MAX_INLINE_DIFF_BYTES as u64 {
                (None, false)
            } else {
                match std::fs::read_to_string(&full_path) {
                    Ok(content) => {
                        let is_bin = !Self::is_text_content(&content);
                        (Some(content), is_bin)
                    }
                    Err(_) => (None, false),
                }
            }
        } else {
            (None, false)
        };

        // 3. 判断变更类型
        let change_type = match (&old_content, &new_content) {
            (Some(_), Some(_)) => DiffChangeType::Modified,
            (Some(_), None) => DiffChangeType::Deleted,
            (None, Some(_)) => DiffChangeType::Added,
            (None, None) => return Err(GitServiceError::CLIError("文件无变更".into())),
        };

        // 4. 计算 diff 行数
        let (additions, deletions) = if !is_binary {
            if let (Some(old), Some(new)) = (&old_content, &new_content) {
                Self::compute_line_diff(old, new)
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        // 5. 构建状态提示
        let status_hint = Some(GitDiffStatusHint {
            has_conflict: true,
            message: Some("暂存区标记为删除，但工作区有新内容".to_string()),
            current_view: "HEAD vs 工作区".to_string(),
        });

        // 6. 计算 content_omitted（在移动之前）
        let content_omitted = old_content.is_none() && new_content.is_none();

        Ok(GitDiffEntry {
            file_path: file_path.to_string(),
            old_file_path: None,
            change_type,
            old_content,
            new_content,
            additions: Some(additions),
            deletions: Some(deletions),
            is_binary,
            content_omitted: if content_omitted { Some(true) } else { None },
            status_hint,
        })
    }

    /// 比较暂存区和工作区
    fn get_diff_index_to_workdir(
        repo: &Repository,
        file_path: &str,
    ) -> Result<GitDiffEntry, GitServiceError> {

        // 1. 获取暂存区内容
        let index = repo.index()?;

        // 获取索引中的条目
        let old_content = if let Some(entry) = index.get_path(std::path::Path::new(file_path), 0) {
            let id = entry.id;
            if let Ok(blob) = repo.find_blob(id) {
                if blob.size() > MAX_INLINE_DIFF_BYTES {
                    None
                } else if blob.is_binary() {
                    None
                } else {
                    std::str::from_utf8(blob.content()).ok().map(|s| s.to_string())
                }
            } else {
                None
            }
        } else {
            None
        };

        // 2. 读取工作区内容
        let workdir = repo.workdir().ok_or(GitServiceError::NotARepository)?;
        let full_path = workdir.join(file_path);

        let (new_content, is_binary) = if full_path.exists() {
            match std::fs::read_to_string(&full_path) {
                Ok(content) => {
                    let is_bin = !Self::is_text_content(&content);
                    (Some(content), is_bin)
                }
                Err(_) => (None, false),
            }
        } else {
            (None, false)
        };

        // 3. 判断变更类型
        let change_type = match (&old_content, &new_content) {
            (Some(_), Some(_)) => DiffChangeType::Modified,
            (Some(_), None) => DiffChangeType::Deleted,
            (None, Some(_)) => DiffChangeType::Added,
            (None, None) => return Err(GitServiceError::CLIError("文件无变更".into())),
        };

        // 4. 计算行数
        let (additions, deletions) = if !is_binary {
            if let (Some(old), Some(new)) = (&old_content, &new_content) {
                Self::compute_line_diff(old, new)
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        // 5. 状态提示
        let status_hint = Some(GitDiffStatusHint {
            has_conflict: true,
            message: Some("暂存区和工作区都有修改".to_string()),
            current_view: "暂存区 vs 工作区".to_string(),
        });

        // 6. 计算 content_omitted
        let content_omitted = old_content.is_none() && new_content.is_none();

        Ok(GitDiffEntry {
            file_path: file_path.to_string(),
            old_file_path: None,
            change_type,
            old_content,
            new_content,
            additions: Some(additions),
            deletions: Some(deletions),
            is_binary,
            content_omitted: if content_omitted { Some(true) } else { None },
            status_hint,
        })
    }

    /// 计算行级 diff
    fn compute_line_diff(old: &str, new: &str) -> (usize, usize) {
        use similar::{ChangeTag, TextDiff};

        let diff = TextDiff::from_lines(old, new);

        let mut additions = 0;
        let mut deletions = 0;

        for op in diff.iter_all_changes() {
            match op.tag() {
                ChangeTag::Insert => additions += 1,
                ChangeTag::Delete => deletions += 1,
                _ => {}
            }
        }

        (additions, deletions)
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
            // 优化：不要使用 add_all(["*"]) 扫描整个工作区
            // 而是获取 Git 状态，只添加有变更的文件
            let mut opts = StatusOptions::new();
            opts.include_untracked(true)
                .include_ignored(false)
                .recurse_untracked_dirs(true);

            let statuses = repo.statuses(Some(&mut opts))?;

            // Windows 保留名称列表
            let reserved = ["nul", "con", "prn", "aux", "com1", "com2", "com3", "com4", "lpt1", "lpt2", "lpt3"];

            // 只添加有变更的文件
            let mut added_count = 0;
            for entry in statuses.iter() {
                if let Some(path_str) = entry.path() {
                    // 检查是否为 Windows 保留名称
                    let path_lower = path_str.to_lowercase();
                    if reserved.iter().any(|&r| path_lower.contains(r)) {
                        eprintln!("[GitService] 跳过 Windows 保留名称文件: {}", path_str);
                        continue;
                    }

                    // 添加文件到索引
                    if let Err(e) = index.add_path(std::path::Path::new(path_str)) {
                        // 某些文件可能无法添加（如被删除的文件），这是正常的
                        eprintln!("[GitService] 跳过文件 {}: {:?}", path_str, e);
                    } else {
                        added_count += 1;
                    }
                }
            }

            eprintln!("[GitService] 已添加 {} 个文件到暂存区", added_count);

            // 写入索引
            index.write()?;
        }

        // 检查是否有变更
        if index.is_empty() {
            return Err(GitServiceError::CLIError("No changes to commit".to_string()));
        }

        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        let sig = repo.signature()?;

        // 检查是否为空仓库（首次提交）
        let is_empty = repo.is_empty()?;

        let oid = if is_empty {
            eprintln!("[GitService] 首次提交：创建初始分支");
            // 首次提交：没有父提交
            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                message,
                &tree,
                &[],  // 空数组表示首次提交
            )?
        } else {
            // 正常提交：有父提交
            let head = repo.head()?;
            let parent_commit = head.peel_to_commit()?;

            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                message,
                &tree,
                &[&parent_commit],
            )?
        };

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
