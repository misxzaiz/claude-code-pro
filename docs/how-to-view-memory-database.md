# 如何查看记忆数据库

## 📍 数据库文件位置

**文件名**: `polaris_memory.db`

**存储位置**（根据操作系统不同）：

### Windows
```
C:\Users\<你的用户名>\AppData\Local\com.polaris.app\polaris_memory.db
```

或者（开发环境）：
```
C:\Users\<你的用户名>\AppData\Local\polaris\polaris_memory.db
```

### macOS
```
~/Library/Application Support/com.polaris.app/polaris_memory.db
```

### Linux
```
~/.local/share/com.polaris.app/polaris_memory.db
```

---

## 🔍 如何查看数据库

### 方法 1: 使用记忆面板（最简单）

1. 打开 Polaris 应用
2. 点击左侧 ActivityBar 的 **大脑图标** 🧠
3. 切换到 **"浏览"** 标签
4. 可以看到所有保存的记忆

**优点**：
- ✅ 无需安装额外工具
- ✅ 图形化界面，易于操作
- ✅ 支持搜索、过滤、删除

---

### 方法 2: 使用浏览器控制台

1. 打开 Polaris 应用
2. 按 **F12** 打开开发者工具
3. 切换到 **Console** 标签
4. 输入以下代码：

```javascript
// 查看所有记忆
fetch('tauri://localhost/sqlite')
  .then(/* ... */)

// 更简单的方法：查看应用日志
// 在控制台中搜索 "LongTermMemoryService"
```

**在控制台中搜索**：
```
[LongTermMemoryService] 保存知识完成
```

可以看到记忆保存的详细信息：
```
created: 4    // 新创建了 4 条记忆
updated: 0    // 更新了 0 条
failed: 0     // 失败了 0 条
```

---

### 方法 3: 使用 SQLite 命令行工具

#### 安装 SQLite

**Windows**:
1. 下载 SQLite: https://www.sqlite.org/download.html
2. 下载 `sqlite-tools-win34-*.zip`
3. 解压到某个目录（如 `C:\sqlite`）
4. 将该目录添加到系统 PATH

**macOS**:
```bash
# macOS 通常自带 SQLite
sqlite3 --version
```

**Linux**:
```bash
sudo apt-get install sqlite3
```

#### 查看数据库

**1. 打开数据库**:
```bash
# Windows
cd C:\Users\<你的用户名>\AppData\Local\com.polaris.app
sqlite3 polaris_memory.db

# macOS/Linux
cd ~/.local/share/com.polaris.app
sqlite3 polaris_memory.db
```

**2. 查看所有表**:
```sql
.tables
```

**输出**:
```
long_term_memories  sessions  message_scores
```

**3. 查看记忆数量**:
```sql
SELECT COUNT(*) FROM long_term_memories;
```

**4. 查看所有记忆**:
```sql
SELECT type, key, value, hit_count FROM long_term_memories;
```

**5. 按类型查看**:
```sql
SELECT type, COUNT(*) as count
FROM long_term_memories
GROUP BY type;
```

**6. 查看最新记忆**:
```sql
SELECT * FROM long_term_memories
ORDER BY created_at DESC
LIMIT 10;
```

**7. 查看高频记忆**:
```sql
SELECT type, key, hit_count
FROM long_term_memories
ORDER BY hit_count DESC
LIMIT 10;
```

**8. 查看表结构**:
```sql
.schema long_term_memories
```

**输出**:
```sql
CREATE TABLE long_term_memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  session_id TEXT,
  workspace_path TEXT,
  confidence REAL,
  created_at TEXT,
  updated_at TEXT,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
```

---

### 方法 4: 使用图形化 SQLite 工具

#### 推荐工具

**DB Browser for SQLite** (免费，跨平台)
- 下载: https://sqlitebrowser.org/
- 支持 Windows、macOS、Linux
- 图形化界面，易于使用

**使用步骤**:
1. 安装 DB Browser for SQLite
2. 打开软件
3. 点击 "Open Database"
4. 导航到数据库位置（如上所述）
5. 选择 `polaris_memory.db`
6. 浏览数据：
   - **Browse Data** 标签：查看表数据
   - **Execute SQL** 标签：执行 SQL 查询
   - **Database Structure** 标签：查看表结构

---

## 📊 数据库结构详解

### 表 1: `long_term_memories` (长期记忆)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | 唯一标识 |
| `type` | TEXT | 知识类型：`project_context`, `key_decision`, `user_preference`, `faq`, `code_pattern` |
| `key` | TEXT | 知识键（用于去重） |
| `value` | TEXT | 知识内容（JSON 格式） |
| `session_id` | TEXT | 关联会话 ID（全局知识为 NULL） |
| `workspace_path` | TEXT | 工作区路径 |
| `confidence` | REAL | 置信度（0-1） |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |
| `hit_count` | INTEGER | 命中次数 |
| `last_hit_at` | TEXT | 最后命中时间 |
| `is_deleted` | INTEGER | 是否删除（0=否，1=是） |

### 表 2: `sessions` (会话)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | 会话 ID |
| `workspace_path` | TEXT | 工作区路径 |
| `created_at` | TEXT | 创建时间 |
| `message_count` | INTEGER | 消息数量 |

### 表 3: `message_scores` (消息评分)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | 唯一标识 |
| `session_id` | TEXT | 会话 ID |
| `message_id` | TEXT | 消息 ID |
| `role_score` | REAL | 角色评分 |
| `content_score` | REAL | 内容评分 |
| `total_score` | REAL | 总评分 |

---

## 🧪 验证记忆系统是否工作

### 测试步骤

**1. 发送一条消息**
- 打开 Polaris 应用
- 发送消息："使用 Tailwind CSS 进行样式设计"

**2. 等待 AI 回复完成**
- 会话结束后会自动触发记忆提取

**3. 查看控制台日志**（F12）
- 应该看到：
  ```
  [LongTermMemoryService] 开始提取长期记忆...
  [LongTermMemoryService] 提取完成 {total: 3}
  [LongTermMemoryService] 批量保存知识...
  [LongTermMemoryService] 保存知识完成: {created: 3, updated: 0, failed: 0}
  ```

**4. 查看记忆面板**
- 点击左侧大脑图标 🧠
- 切换到 **"统计"** 标签
- 应该看到记忆数量增加

**5. 使用 SQLite 查看**
```bash
sqlite3 polaris_memory.db "SELECT type, key, value FROM long_term_memories ORDER BY created_at DESC LIMIT 5;"
```

---

## 🔧 常见问题

### Q1: 找不到数据库文件

**A**: 数据库只有在**第一次保存记忆时**才会被创建。

**解决方法**：
1. 确保 Polaris 应用正在运行
2. 发送一条消息并等待回复完成
3. 检查控制台是否有 `[LongTermMemoryService]` 相关日志
4. 如果没有日志，说明记忆提取功能未正常工作

### Q2: 数据库文件为空

**A**: 可能是以下原因：
1. 记忆提取失败（查看控制台错误日志）
2. FOREIGN KEY 约束失败（已修复）
3. 数据库初始化失败

**解决方法**：
```bash
# 查看日志
sqlite3 polaris_memory.db "SELECT * FROM long_term_memories;"

# 如果确实是空的，删除数据库让它重新创建
rm polaris_memory.db
```

### Q3: 如何清空所有记忆

**A**: 三种方法：

**方法 1**: 删除数据库文件
```bash
rm polaris_memory.db
```

**方法 2**: 使用 SQL 清空表
```sql
DELETE FROM long_term_memories;
```

**方法 3**: 使用记忆面板
- 打开记忆面板
- 逐个删除记忆

---

## 📝 快速命令参考

```bash
# Windows PowerShell
cd $env:LOCALAPPDATA\com.polaris.app
sqlite3 polaris_memory.db

# Windows CMD
cd %LOCALAPPDATA%\com.polaris.app
sqlite3 polaris_memory.db

# macOS/Linux
cd ~/.local/share/com.polaris.app
sqlite3 polaris_memory.db

# 常用查询
SELECT COUNT(*) FROM long_term_memories;                        # 总数
SELECT type, COUNT(*) FROM long_term_memories GROUP BY type;    # 按类型统计
SELECT * FROM long_term_memories ORDER BY hit_count DESC LIMIT 10;  # 高频记忆
SELECT * FROM long_term_memories WHERE created_at > '2026-02-03';  # 今日记忆
```

---

## 🎯 总结

**最简单的方法**：
1. 打开 Polaris 应用
2. 点击左侧大脑图标 🧠
3. 在记忆面板中浏览所有记忆

**最详细的方法**：
1. 安装 DB Browser for SQLite
2. 打开 `polaris_memory.db`
3. 使用图形界面查看和管理数据

**最快速的方法**：
1. 打开命令行
2. 进入数据库所在目录
3. 使用 `sqlite3 polaris_memory.db` 查询

有任何问题随时问我哦~ 😊
