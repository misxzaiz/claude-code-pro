# 性能优化任务清单 - 2026-01-27

> **创建时间**: 2026-01-27
> **状态**: 进行中
> **优先级**: P0（影响用户体验）

---

## 📊 性能问题总结

### P0 级别问题（影响用户体验，必须优先修复）

| 问题 | 当前影响 | 修复难度 | 预期收益 |
|------|---------|---------|---------|
| 每个 token 都重新解析整个 Markdown | 流式输出卡顿，CPU 飙升 | 中等 | 减少 80% 解析时间 |
| 手动复制大对象数组 | 长对话时状态更新慢 | 简单 | 减少 50% 更新时间 |
| TokenBuffer 只在首次启用 | 流式后期性能下降 | 简单 | 流畅度提升 3x |
| AssistantBubble 的 memo 比较过复杂 | 不必要的重渲染 | 简单 | 减少 60% 重渲染 |
| Virtuoso 预渲染区域过大 | 内存占用高 | 简单 | 减少 30% 内存占用 |
| localStorage 频繁同步写入 | UI 卡顿 | 简单 | 消除卡顿 |
| 事件总线双重广播 + 历史记录 | 事件延迟 | 中等 | 减少 40% 事件开销 |

---

## 🎯 修复方案（按顺序执行）

### 阶段 1：状态管理优化

> **预期收益**: 减少 50% 状态更新时间，消除 UI 卡顿
> **风险等级**: 低
> **预计时间**: 1-2 小时

#### ✅ 任务 1.1：引入 Immer 中间件

**文件**: `src/stores/eventChatStore.ts`

**改动内容**:
1. 安装 `immer` 依赖（`npm install immer`）
2. 导入 `immer` 中间件
3. 将 Store 包装为 `immer()`
4. 简化所有状态更新逻辑（去掉手动 spread 操作）

**修改示例**:
```typescript
// 修改前
const updatedBlocks = [...currentMessage.blocks];
updatedBlocks[blockIndex] = updatedBlock;
set({ currentMessage: { ...currentMessage, blocks: updatedBlocks } });

// 修改后
set(state => {
  if (state.currentMessage) {
    state.currentMessage.blocks[blockIndex] = updatedBlock;
  }
});
```

**测试点**:
- [ ] 发送消息后内容正确显示
- [ ] 工具调用状态正确更新
- [ ] 历史消息正确加载
- [ ] 会话恢复正常工作

**风险**: 低 - Immer 是成熟库，Zustand 官方支持

---

#### ✅ 任务 1.2：持久化节流

**文件**: `src/stores/eventChatStore.ts`

**改动内容**:
1. 实现 `debounceSaveToStorage()` 函数（延迟 1 秒）
2. 将 `saveToStorage()` 改为防抖版本
3. 在消息完成时立即保存（绕过防抖）

**修改示例**:
```typescript
import { debounce } from 'lodash-es'; // 或使用自定义实现

const debouncedSave = debounce(() => {
  saveToStorage();
}, 1000);

// 在需要立即保存的地方
const finishMessage = () => {
  // ... 完成消息逻辑
  debouncedSave.flush(); // 立即保存
};
```

**测试点**:
- [ ] 刷新页面后消息仍然存在
- [ ] 崩溃恢复正常工作
- [ ] 频繁输入不会导致多次保存

**风险**: 低 - 防抖是常见优化手段

---

### 阶段 2：组件渲染优化

> **预期收益**: 减少 60% 不必要的重渲染，降低 30% 内存占用
> **风险等级**: 低
> **预计时间**: 2-3 小时

#### ✅ 任务 2.1：简化 AssistantBubble 的 memo 比较

**文件**: `src/components/Chat/EnhancedChatMessages.tsx`

**改动内容**:
1. 为每个 block 添加 `version` 字段（递增计数器）
2. 简化 `AssistantBubble` 的自定义比较函数
3. 只检查 `version` 而非深度遍历所有 blocks

**修改示例**:
```typescript
// 修改前 (Line 1019-1059)
const areEqual = (prevProps, nextProps) => {
  // 复杂的深度比较逻辑...
  // 遍历所有 blocks 检查变化
};

// 修改后
const areEqual = (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.version === nextProps.message.version;
};
```

**需要在 Store 中添加**:
```typescript
// 在 updateCurrentAssistantMessage 中
state.currentMessage.version = (state.currentMessage.version || 0) + 1;
```

**测试点**:
- [ ] 流式输出流畅，无卡顿
- [ ] 工具调用更新不影响其他 block
- [ ] 用户编辑代码后仍能正常更新

**风险**: 低 - 只是优化比较逻辑

---

#### ✅ 任务 2.2：优化 Virtuoso 配置

**文件**: `src/components/Chat/EnhancedChatMessages.tsx`

**改动内容**:
1. 将 `increaseViewportBy` 从 `{ top: 100, bottom: 300 }` 改为 `{ top: 50, bottom: 150 }`
2. 启用 `scrollSeekPlaceholder` 以提升滚动性能
3. 调整 `defaultItemHeight` 为更精确的值

**修改示例**:
```typescript
// 修改前 (Line 1254)
<Virtuoso
  increaseViewportBy={{ top: 100, bottom: 300 }}
  // ...
/>

// 修改后
<Virtuoso
  increaseViewportBy={{ top: 50, bottom: 150 }}
  scrollSeekPlaceholder={({ height }) => <div style={{ height }} className="animate-pulse bg-gray-800/50 rounded" />}
  components={{
    ScrollSeekPlaceholder: ({ height }) => <div style={{ height }} />
  }}
  // ...
/>
```

**测试点**:
- [ ] 长对话滚动流畅
- [ ] 内存占用降低（可验证）
- [ ] 快速滚动时无白屏

**风险**: 低 - 只是调整配置参数

---

### 阶段 3：Markdown 增量渲染

> **预期收益**: 减少 80% 的 Markdown 解析时间
> **风险等级**: 中等
> **预计时间**: 4-6 小时

#### ✅ 任务 3.1：实现增量 Markdown 解析

**文件**:
- `src/components/Chat/EnhancedChatMessages.tsx`
- `src/utils/markdown-enhanced.ts`（可能需要创建）

**改动内容**:
1. 在 `TextPartRenderer` 中记录上次解析的内容长度
2. 只解析新增的 token 部分
3. 将解析结果追加到已有 DOM，而非重新渲染整个内容
4. 对于代码块，只在完整时才渲染高亮

**技术方案**:
```typescript
// 伪代码示例
const IncrementalTextRenderer = ({ content }) => {
  const lastLengthRef = useRef(0);
  const [parsedContent, setParsedContent] = useState('');

  useEffect(() => {
    const newContent = content.slice(lastLengthRef.current);
    const parsed = parseMarkdownIncremental(newContent);
    setParsedContent(prev => prev + parsed);
    lastLengthRef.current = content.length;
  }, [content]);

  return <div dangerouslySetInnerHTML={{ __html: parsedContent }} />;
};
```

**需要注意**:
- Mermaid 图表需要完整代码才能渲染
- 代码块语法高亮可能需要完整代码
- 需要处理跨块的 Markdown 元素（如列表）

**测试点**:
- [ ] 流式输出正确显示
- [ ] 代码块高亮正常
- [ ] Mermaid 图表正确渲染
- [ ] 列表、引用等 Markdown 元素正确显示
- [ ] 特殊字符（如 `<`、`>`）正确转义

**风险**: 中等 - 增量渲染需要仔细处理边界情况

---

### 阶段 4：事件总线优化（可选）

> **预期收益**: 减少 40% 的事件处理开销
> **风险等级**: 中等
> **预计时间**: 2-3 小时

#### ✅ 任务 4.1：事件批处理

**文件**: `src/ai-runtime/event-bus.ts`

**改动内容**:
1. 对高频事件（如 `token`）使用 `requestAnimationFrame` 批量发送
2. 延迟历史记录的添加（只在有订阅者时记录）
3. 使用环形缓冲区代替 `shift()` 操作

**修改示例**:
```typescript
// 伪代码示例
private tokenBuffer: AIEvent[] = [];
private rafId: number | null = null;

emit(event: AIEvent): void {
  if (event.type === 'token') {
    this.tokenBuffer.push(event);
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.flushTokenBuffer();
      });
    }
  } else {
    // 其他事件立即发送
    this.bus.emit(event.type, event);
    this.bus.emit('*', event);
  }
}

private flushTokenBuffer(): void {
  const events = this.tokenBuffer;
  this.tokenBuffer = [];
  this.rafId = null;

  // 批量发送
  events.forEach(event => {
    this.bus.emit(event.type, event);
  });
}
```

**测试点**:
- [ ] 流式输出仍然流畅
- [ ] 事件顺序保持正确
- [ ] 内存无泄漏（rafId 正确清理）

**风险**: 中等 - 需要确保事件顺序和时序正确

---

## 📋 执行计划

### 第一步：状态管理优化（任务 1.1 + 1.2）
- **开始时间**: 待定
- **预计完成**: 1-2 小时
- **风险**: 最低
- **收益**: 立即见效

### 第二步：组件渲染优化（任务 2.1 + 2.2）
- **开始时间**: 第一步完成后
- **预计完成**: 2-3 小时
- **风险**: 低
- **收益**: 显著提升

### 第三步：Markdown 增量渲染（任务 3.1）
- **开始时间**: 第二步完成后
- **预计完成**: 4-6 小时
- **风险**: 中等
- **收益**: 最大

### 第四步：事件总线优化（任务 4.1）
- **可选**: 根据前三步效果决定是否需要
- **预计完成**: 2-3 小时
- **风险**: 中等
- **收益**: 中等

---

## 🧪 性能基准测试

在开始优化前，建议建立性能基准以便量化优化效果：

### 测试指标

| 指标 | 测试方法 | 目标值 |
|------|---------|--------|
| 首字延迟 | 发送消息到第一个 token 出现的时间 | < 500ms |
| 流式流畅度 | Token 更新时的帧率 | > 30fps |
| 内存占用 | 打开 100 条消息后的内存 | < 500MB |
| 长对话滚动 | 500 条消息滚动帧率 | > 30fps |
| 状态更新时间 | 更新当前消息的耗时 | < 50ms |

### 测试工具

- Chrome DevTools Performance 录制
- React DevTools Profiler
- 内存快照对比

---

## ✅ 完成标准

每个任务完成后需要满足：

1. **功能正常**: 所有现有功能不受影响
2. **性能提升**: 对应指标达到预期改善
3. **代码质量**: 代码可读性良好，有适当注释
4. **测试通过**: 所有测试点都通过
5. **文档更新**: 更新此文档中的完成状态

---

## 📝 变更日志

| 日期 | 任务 | 状态 | 备注 |
|------|------|------|------|
| 2026-01-27 | 创建文档 | ✅ | 初始版本 |
| | | | |
| | | | |

---

## 🔗 相关文档

- [性能分析报告](./performance-analysis-20260127.md) - 详细的性能问题分析
- [项目架构文档](../architecture/event-driven-architecture.md) - 了解事件驱动架构
- [优化清单](./optimization.md) - 其他代码优化项

---

> **下一步**: 准备好后，按顺序开始执行任务 1.1
