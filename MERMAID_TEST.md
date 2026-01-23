# Mermaid.js 图表测试

本文件包含各种 Mermaid 图表类型的示例，用于测试 Polaris 的图表渲染功能。

---

## 1. 流程图 (Flowchart)

```mermaid
graph TD
    A[开始] --> B{是否需要 Mermaid?}
    B -->|是| C[安装 mermaid]
    B -->|否| D[结束]
    C --> E[创建配置文件]
    E --> F[创建组件]
    F --> D
```

---

## 2. 时序图 (Sequence Diagram)

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Server
    participant Database

    User->>Browser: 点击登录按钮
    Browser->>Server: POST /api/login
    activate Server
    Server->>Database: 查询用户信息
    activate Database
    Database-->>Server: 返回用户数据
    deactivate Database
    Server-->>Browser: 返回 JWT Token
    deactivate Server
    Browser-->>User: 登录成功，跳转首页
```

---

## 3. 类图 (Class Diagram)

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +eat()
        +sleep()
    }
    class Dog {
        +String breed
        +bark()
        +fetch()
    }
    class Cat {
        +String color
        +meow()
        +scratch()
    }
    Animal <|-- Dog
    Animal <|-- Cat
```

---

## 4. 状态图 (State Diagram)

```mermaid
stateDiagram-v2
    [*] --> 待处理
    待处理 --> 处理中: 开始处理
    处理中 --> 已完成: 处理成功
    处理中 --> 失败: 处理失败
    失败 --> 待处理: 重试
    已完成 --> [*]
    失败 --> [*]: 放弃
```

---

## 5. ER 图 (Entity Relationship)

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "included in"
    USER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        int user_id FK
        date created_at
    }
    PRODUCT {
        int id PK
        string name
        float price
    }
    LINE_ITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
    }
```

---

## 6. 甘特图 (Gantt Chart)

```mermaid
gantt
    title 项目开发计划
    dateFormat  YYYY-MM-DD
    section 设计阶段
    需求分析      :a1, 2024-01-01, 7d
    UI 设计       :a2, after a1, 14d
    section 开发阶段
    前端开发      :b1, after a2, 21d
    后端开发      :b2, after a2, 21d
    section 测试阶段
    集成测试      :c1, after b1, 7d
    用户验收      :c2, after c1, 7d
```

---

## 7. 用户旅程图 (Journey Diagram)

```mermaid
journey
    title 用户购物体验
    section 浏览商品
      浏览首页: 5: 用户
      搜索商品: 4: 用户
      查看详情: 5: 用户
    section 下单购买
      加入购物车: 5: 用户
      填写地址: 3: 用户
      支付订单: 4: 用户
    section 售后服务
      收到商品: 5: 用户
      申请退款: 2: 用户
```

---

## 8. 思维导图 (Mindmap)

```mermaid
mindmap
  root((编程))
    前端
      React
      Vue
      Angular
    后端
      Node.js
      Python
      Rust
      Go
    数据库
      MySQL
      PostgreSQL
      MongoDB
    DevOps
      Docker
      Kubernetes
      CI/CD
```

---

## 9. 饼图 (Pie Chart)

```mermaid
pie title 编程语言使用率
    "JavaScript" : 45
    "Python" : 25
    "Java" : 15
    "C++" : 10
    "其他" : 5
```

---

## 10. Git 图 (Git Graph)

```mermaid
gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout develop
    merge feature
```

---

## 测试说明

将以上内容复制到 Polaris 的聊天对话框中发送，AI 响应中的 Mermaid 代码块将被渲染为可视化图表。

### 预期效果：

1. **流程图**：显示决策树形状的流程图
2. **时序图**：显示各参与者之间的交互序列
3. **类图**：显示类继承关系
4. **状态图**：显示状态转换流程
5. **ER 图**：显示数据库表关系
6. **甘特图**：显示项目时间线
7. **用户旅程图**：显示用户体验各阶段的满意度
8. **思维导图**：显示知识结构
9. **饼图**：显示数据占比
10. **Git 图**：显示 Git 分支历史

所有图表应使用与 Polaris 一致的暗色主题样式。
