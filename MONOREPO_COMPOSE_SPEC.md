# Event OS Monorepo + docker-compose 工程目录 Spec

版本：`v0.1`
目标：定义可以直接落地实现的仓库结构、服务边界和本地编排方式。

## 1. 设计目标

这个仓库只做一件事：承载 Event OS 的多服务开发与部署。

要求：

- 前端、API、CMS 管理端、Realtime、共享包分层清晰
- 本地开发可一键拉起依赖
- 各服务可独立开发、独立启动、独立部署
- `docker-compose` 只负责编排基础设施和服务依赖

## 2. Monorepo 原则

### 必须满足

- 所有可复用类型、常量、契约放在共享包
- 前端不直接引用后端私有实现
- API 不依赖前端构建产物
- CMS 管理端只负责内容，不承担业务编排
- Realtime 只负责广播和订阅，不存放最终事实数据

### 禁止

- 单体式“全塞一个项目”
- 将业务逻辑散落在页面层
- 用脚本临时拼接开发环境
- 让数据库、缓存、消息、应用混在同一个容器里

## 3. 推荐目录结构

```text
eventos/
├── apps/
│   ├── web-miniapp/          # Taro 微信小程序
│   ├── api/                  # Bun + Hono API
│   ├── cms/                  # TDesign React CMS admin
│   └── realtime/             # uWebSockets.js 实时服务
├── packages/
│   ├── contracts/            # API DTO / schema / event payload
│   ├── shared/               # 纯工具、常量、通用类型
│   ├── config/               # 通用配置、env 读取、runtime constants
│   └── ui/                   # 可选：前端共享组件
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── cms.Dockerfile
│   │   ├── realtime.Dockerfile
│   │   └── web-miniapp.Dockerfile
│   └── sql/
│       └── migrations/
├── docker-compose.yml
├── docker-compose.override.yml
├── package.json
├── tsconfig.base.json
├── bunfig.toml
├── README.md
└── .env.example
```

## 4. 目录职责

### `apps/web-miniapp`

职责：

- 用户入口
- Activity 选择
- Agenda 展示
- Session 详情
- QR Pass 展示
- Check-in 入口
- 我的页面

技术：

- Taro
- React
- TypeScript
- Zustand
- TDesign-miniprogram

### `apps/api`

职责：

- 登录
- Activity / Registration / QR Pass / My Agenda / Check-in 业务
- Authing token 与权限 scope 校验
- PostgreSQL 读写
- Redis 读写
- 向 Realtime 发布事件

技术：

- Bun
- Hono
- Drizzle ORM
- Zod

### `apps/cms`

职责：

- 内容管理
- Activity 内容
- Session 内容
- Speaker 内容
- Organizer、Sponsor、Expo Booth、Live Entry、Survey、Notification、Page Config
- Activity-level draft/published 发布管理

技术：

- TDesign React + Vite
- PostgreSQL

### `apps/realtime`

职责：

- WebSocket 连接
- 订阅 Redis 变更
- 广播签到和人数变化

技术：

- uWebSockets.js
- Redis

### `packages/contracts`

职责：

- API 请求/响应类型
- 事件 payload 类型
- 数据契约

要求：

- 只放纯类型和 schema
- 不放运行时依赖业务逻辑

### `packages/shared`

职责：

- 通用工具函数
- 通用常量
- 日期、ID、签名相关 helper

要求：

- 无框架依赖
- 可被所有 app 引用

### `packages/config`

职责：

- 环境变量定义
- 端口常量
- 服务名常量
- 运行时开关

要求：

- 单点读取 env
- 避免各服务各写一套解析逻辑

## 5. 包依赖约束

### 允许依赖方向

```text
apps/* -> packages/*
apps/api -> PostgreSQL / Redis
apps/realtime -> Redis
apps/cms -> PostgreSQL
```

### 禁止依赖方向

```text
packages/* -> apps/*
apps/web-miniapp -> apps/api internal modules
apps/cms -> apps/api internal modules
apps/realtime -> apps/api internal modules
```

## 6. 根目录配置

### `package.json`

根包必须声明：

- `private: true`
- `workspaces`

工作区建议：

- `apps/*`
- `packages/*`

### `tsconfig.base.json`

要求：

- 所有子项目继承基础配置
- 统一路径别名策略
- 统一严格模式

### `bunfig.toml`

要求：

- 只放 Bun 相关基础配置
- 不把业务配置写进 Bun 配置

## 7. docker-compose 目标

`docker-compose` 的职责是把开发所需依赖和服务编排起来，不负责构建业务逻辑。

### 必需服务

- `postgres`
- `redis`
- `cms`
- `api`
- `realtime`

### 可选服务

- `mailhog` 或类似本地邮件服务
- `adminer` / `pgadmin`

### 不建议放入 compose 的内容

- 前端热更新宿主构建逻辑
- 一次性脚本
- 临时调试容器

## 8. 服务拓扑

```text
web-miniapp
  -> api
api
  -> postgres
  -> redis
  -> realtime
cms
  -> postgres
realtime
  -> redis
postgres
redis
```

## 9. docker-compose 服务说明

### 9.1 `postgres`

职责：

- 存储最终数据
- 统一承载 users / tenants / activities / sessions / registrations / qr_passes / my_agenda_items / checkins / publications / audit_events

要求：

- 使用持久化 volume
- 开发环境保留数据
- 提供健康检查

### 9.2 `redis`

职责：

- session count
- realtime state
- 广播订阅辅助

要求：

- 使用持久化或可重建策略
- 本地开发优先保证启动简单

### 9.3 `cms`

职责：

- 内容录入和编辑
- 连接 `postgres`

要求：

- 显式依赖数据库健康状态
- 独立端口暴露给本地开发

### 9.4 `api`

职责：

- 核心业务接口
- 连接 `postgres` 和 `redis`

要求：

- 支持热重载或 watch 模式
- 依赖 `postgres` 和 `redis` 就绪

### 9.5 `realtime`

职责：

- WebSocket 服务
- Redis 订阅

要求：

- 独立端口
- 与 API 解耦

## 10. 环境变量规范

### 根级 `.env.example`

必须覆盖：

- `NODE_ENV`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `REDIS_HOST`
- `REDIS_PORT`
- `API_PORT`
- `CMS_PORT`
- `REALTIME_PORT`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `AUTHING_APP_ID`
- `AUTHING_APP_SECRET`
- `AUTHING_DOMAIN`
- `QR_HMAC_SECRET`

### 规则

- 所有服务从根环境变量派生
- 子服务可以有各自专属前缀，但不能重复定义同一语义
- 密钥不得写入仓库

## 11. 端口分配建议

- `web-miniapp`：由 Taro 本地开发工具决定，不固定端口
- `api`：`3000`
- `cms`：`5174`
- `realtime`：`3001`
- `postgres`：`5432`
- `redis`：`6379`

## 12. 本地开发模式

### 模式 A：完整编排

使用 `docker-compose` 拉起：

- postgres
- redis
- cms
- api
- realtime

适合：

- 联调
- 验证实时链路
- 做端到端测试

### 模式 B：混合开发

宿主机运行：

- web-miniapp
- api
- realtime

容器运行：

- postgres
- redis
- cms

适合：

- 前端高频开发
- 后端调试
- 不想每次重建前端镜像

## 13. 构建与启动边界

### 前端

- 由 Taro 自己的开发命令负责
- 不由 `docker-compose` 直接构建

### API / Realtime / CMS

- 可在容器内运行
- 也可本地直接运行
- 需要统一命令入口

### 数据库

- 只由 compose 管理
- 不手工在宿主机安装作为默认方案

## 14. 数据与迁移

### 迁移位置

- `infra/sql/migrations`

### 规则

- schema 变更必须版本化
- 初始化数据和迁移数据分离
- 开发种子数据必须可重复执行

## 15. 共享契约

`packages/contracts` 应至少定义：

- API envelope 与 Domain Error Code
- `Tenant`
- `Activity`
- `ActivityPublication`
- `Session`
- `User`
- `Registration`
- `QRPass`
- `MyAgendaItem`
- `Checkin`
- `AuditEvent`
- `RealtimeEvent`

要求：

- 前端和后端都从这里读取统一契约
- WebSocket payload 也必须复用这里的类型
- 业务活动使用 `Activity`，`Event` 仅表示技术事件 payload

## 16. 交付顺序

建议实现顺序：

1. 根目录工作区和基础配置
2. `docker-compose` 拉起 postgres / redis / cms
3. `packages/contracts` 和 `packages/shared`
4. `apps/api`
5. `apps/realtime`
6. `apps/web-miniapp`
7. 补齐迁移、种子和健康检查

## 17. 完成标准

当以下内容成立时，工程骨架算完成：

- 一条命令能拉起基础依赖
- 各 app 有独立目录和独立职责
- 共享类型可被前后端同时引用
- compose 服务拓扑清晰
- 所有服务端口和 env 约定明确
