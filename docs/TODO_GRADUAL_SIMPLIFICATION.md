# 待办系统渐进式简化方案

## 🎯 核心问题

用户反馈:
> "待办还是存在不一致问题"
> "能不能简化,不需要统计全部和其他项目,只要当前项目"
> "直接读写配置下的文件,不要再缓存什么的"

## 📊 现状分析

### 已有的功能
1. ✅ **TodoFileSyncService** - 已实现文件读写
2. ✅ **工作区隔离** - 通过 workspaceId 字段
3. ✅ **文件同步** - 自动同步到 `.polaris/todos.json`

### 存在的问题
1. ❌ **数据源混乱** - localStorage (全局) + 文件 (工作区) 两套数据
2. ❌ **同步不一致** - 文件同步是单向的,没有回读
3. ❌ **过度复杂** - 查询缓存、事件循环防护、多层筛选
4. ❌ **状态不一致** - 不同作用域显示的数据可能不一致

## 💡 简化策略

### 策略1: 移除全局存储,只保留工作区文件

**核心改变**:
- ❌ 移除 `localStorage` 的持久化
- ✅ 只从 `.polaris/todos.json` 读取数据
- ✅ 每次操作直接写文件

**优点**:
- 数据单一来源,不会不一致
- 工作区完全隔离
- 代码简化

**缺点**:
- 需要网络权限(已有)
- 文件操作可能慢(可以优化)

### 策略2: 简化筛选,只保留当前工作区

**核心改变**:
- ❌ 移除 "全部待办" 视图
- ❌ 移除 "全局待办" 概念
- ✅ 只显示当前工作区的待办
- ✅ 移除 scope 切换

**优点**:
- UI 简化,用户不会混淆
- 逻辑清晰
- 性能提升

**缺点**:
- 失去跨工作区查看能力(但用户说不需要)

### 策略3: 移除查询缓存

**核心改变**:
- ❌ 移除 `queryCache`
- ❌ 移除 `cacheExpiration`
- ❌ 移除 `clearQueryCache`
- ✅ 每次直接读取文件

**优点**:
- 代码简化
- 不会出现缓存过期问题
- 数据总是最新的

**缺点**:
- 文件读取频繁(可以加内存缓存)

## 🚀 实施方案

### 阶段1: 修改数据源 (最小改动)

**目标**: 移除 localStorage 持久化,改为文件读写

**修改文件**: `src/stores/todoStore.ts`

```typescript
// 修改前
export const useTodoStore = create<TodoStore>()(
  persist(
    (set, get) => ({
      todos: [],
      // ...
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        todos: state.todos,
        filter: state.filter,
      }),
    }
  )
)

// 修改后
export const useTodoStore = create<TodoStore>((set, get) => ({
  todos: [],
  // 移除 persist 中间件
  // 添加文件读写逻辑
  async loadFromWorkspace(workspacePath: string) {
    const todos = await TodoFileSyncService.readWorkspaceTodos(workspacePath)
    set({ todos: todos || [] })
  }
}))
```

### 阶段2: 简化 UI (移除复杂筛选)

**修改文件**: `src/components/TodoPanel/TodoPanel.tsx`

```typescript
// 修改前
const [scope, setScope] = useState<TodoScope>('workspace')
const filteredTodos = useMemo(() => {
  // 复杂的筛选逻辑
}, [filter, scope, currentWorkspace, selectedWorkspaceId, queryTodos])

// 修改后
// 移除 scope
const todos = useTodoStore(state => state.todos)
// 直接显示,不需要筛选
```

### 阶段3: 移除缓存 (简化查询)

**修改文件**: `src/stores/todoStore.ts`

```typescript
// 移除
interface TodoState {
  queryCache: Map<string, { result: TodoItem[]; timestamp: number }>
  cacheExpiration: number
}

// 简化 queryTodos
queryTodos: (filter: TodoFilter) => {
  // 直接返回,不要缓存
  return get().todos.filter(...)
}
```

### 阶段4: 添加文件自动同步

**修改文件**: `src/stores/todoStore.ts`

```typescript
// 每次修改后自动写文件
createTodo: async (params) => {
  const newTodo = { /* ... */ }
  set((state) => ({
    todos: [...state.todos, newTodo]
  }))

  // 自动写文件
  const workspace = useWorkspaceStore.getState().getCurrentWorkspace()
  if (workspace) {
    await TodoFileSyncService.writeWorkspaceTodos(
      workspace.path,
      workspace.id,
      workspace.name,
      get().todos
    )
  }
}
```

## 📋 简化清单

### 可以删除的功能
- ❌ `scope` 切换 (all/workspace/workspace-select)
- ❌ `selectedWorkspaceId` 选择
- ❌ `workspaceStats` 统计
- ❌ `queryCache` 查询缓存
- ❌ `cacheExpiration` 缓存过期
- ❌ `clearQueryCache` 清理缓存
- ❌ `TodoEventSync` 事件同步 (如果不需要 AI 工具)
- ❌ `TodoContextService` 上下文服务 (如果不需要智能匹配)

### 可以保留的功能
- ✅ `TodoFileSyncService` 文件读写 (已有,很好!)
- ✅ 基本的 CRUD 操作
- ✅ 简单的状态筛选 (pending/in_progress/completed)
- ✅ 优先级排序
- ✅ 详情对话框

### 需要新增的功能
- 📝 工作区切换时自动加载待办
- 📝 文件读写失败时的错误处理
- 📝 文件不存在时的初始化

## 🔄 完整流程

### 初始化
```
1. 应用启动
2. 加载当前工作区
3. 读取 `<workspace>/.polaris/todos.json`
4. 加载到 TodoStore
```

### 切换工作区
```
1. 用户切换工作区
2. 清空当前 todos
3. 读取新工作区的 `.polaris/todos.json`
4. 加载到 TodoStore
```

### 创建待办
```
1. 用户创建待办
2. 添加到 TodoStore
3. 写入 `.polaris/todos.json`
4. 完成
```

### 更新待办
```
1. 用户更新待办
2. 更新 TodoStore
3. 写入 `.polaris/todos.json`
4. 完成
```

## ⚠️ 潜在风险

### 1. 文件并发写入
**问题**: 多个操作同时写文件
**解决**: 添加写锁或队列

### 2. 文件损坏
**问题**: 文件写入失败导致数据丢失
**解决**: 先写临时文件,再重命名

### 3. 性能问题
**问题**: 每次操作都写文件
**解决**: 防抖 + 批量写入

### 4. 兼容性
**问题**: 旧数据在 localStorage
**解决**: 提供数据迁移工具

## 📊 代码量对比

### 当前
- `todoStore.ts`: ~800 行
- `todoEventSync.ts`: ~200 行
- `todoContextService.ts`: ~150 行
- `todoTools.ts`: ~300 行
- `TodoPanel.tsx`: ~770 行
- **总计**: ~2220 行

### 简化后
- `simpleTodoStore.ts`: ~300 行
- `TodoPanel.tsx`: ~300 行
- **总计**: ~600 行

**减少**: ~72%

## 🎁 最终效果

### 用户体验
- ✅ 只看到当前工作区的待办
- ✅ 数据永远一致
- ✅ 操作简单直观

### 开发体验
- ✅ 代码量减少 70%
- ✅ 逻辑清晰,易于维护
- ✅ 性能更好

### 技术架构
- ✅ 单一数据源 (文件)
- ✅ 工作区完全隔离
- ✅ 无缓存,无同步问题

## 🚦 建议

基于你的需求"只要当前项目,直接读写配置下的文件,不要再缓存":

**推荐方案**: 阶段1 + 阶段2 + 阶段3

1. ✅ 移除 localStorage 持久化
2. ✅ 只显示当前工作区的待办
3. ✅ 移除查询缓存
4. ✅ 直接读写 `.polaris/todos.json`

这样改动最小,效果最好!
