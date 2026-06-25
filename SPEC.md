# Event OS（AWS Summit 级微信小程序）Spec

版本：`v0.1`
目标：把 PRD 收敛成可执行工程规范，供 Codex 直接按此实现。

## 1. 产品定义

Event OS 是一个微信小程序形态的活动操作系统。用户进入后可以选择 Event，浏览 Agenda，查看 Session 详情，完成微信登录，领取 QR Ticket，进行 Session Check-in，并实时看到签到人数变化。

## 2. 目标与验收

### 必须交付

- Event 列表与详情
- Agenda 按 Day / Track / Session 展示
- Session 详情页
- 微信登录，绑定 `openid`
- Ticket 自动生成与 QR 展示
- Session Check-in
- 实时人数更新
- 我的页面

### 验收标准

- 用户首次进入可选择 Event
- 进入 Event 后自动生成或获取唯一 Ticket
- Session 扫码后可完成签到
- 同一 `user_id + session_id` 只允许签到一次
- 签到成功后实时人数更新可被前端看到
- 数据持久化与实时态分离，最终数据以 PostgreSQL 为准

## 3. 用户角色

- Attendee：查看日程、获取 Ticket、签到
- Organizer：管理内容、查看实时态
- Admin：系统配置、内容发布、权限管理

## 4. 业务范围

### 4.1 Event 模块

职责：

- 展示 Event 列表
- 进入 Event 详情
- 作为系统入口

规则：

- 用户必须先选择 Event，才能进入 Agenda 主流程
- Event 必须有开始时间和结束时间

### 4.2 Agenda 模块

职责：

- 按 Day 展示
- 按 Track 分组
- 展示 Session 列表
- 进入 Session 详情

规则：

- Session 必须属于某个 Event
- Session 必须有时间区间
- Session 必须有 Room

UI 结构：

- Day Tabs
- Track Sections
- Session Cards

### 4.3 Session 模块

职责：

- 查看详情
- 收藏
- 查看实时人数
- 查看签到状态

行为链路：

- `view -> favorite -> check-in`

### 4.4 用户系统

职责：

- 微信登录
- 获取并绑定 `openid`
- 创建用户档案

规则：

- `openid` 必须唯一
- 用户身份以微信登录结果为准

### 4.5 Ticket 系统

职责：

- 用户进入 Event 后自动生成 Ticket
- 使用 QR Code 表示身份

规则：

- `user_id + event_id` 必须唯一
- `qr_token` 必须签名，不能明文可伪造

### 4.6 Check-in 系统

职责：

- Session 扫码签到
- 防重复签到
- 更新实时人数

规则：

- 同一 `user_id + session_id` 只能签到一次
- 成功后写入签到记录并更新实时计数

核心流程：

1. 扫码
2. 校验 QR
3. 写入 checkin
4. 更新 Redis
5. 广播实时事件

### 4.7 Realtime 系统

职责：

- 实时更新 Session 人数
- 广播签到事件
- 驱动 UI 刷新

规则：

- Redis 存实时态
- WebSocket 负责推送
- PostgreSQL 负责最终一致性

### 4.8 我的页面

职责：

- 我的二维码
- 我的收藏 Session
- 我的签到记录

## 5. 数据模型

### Event

```ts
type Event = {
  id: string;
  name: string;
  description: string;
  start_time: string;
  end_time: string;
};
```

### Session

```ts
type Session = {
  id: string;
  event_id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  room: string;
  speaker: string;
  track: string;
};
```

### User

```ts
type User = {
  id: string;
  openid: string;
  nickname: string;
};
```

### Ticket

```ts
type Ticket = {
  id: string;
  user_id: string;
  event_id: string;
  qr_token: string;
};
```

### Checkin

```ts
type Checkin = {
  id: string;
  user_id: string;
  session_id: string;
  created_at: string;
};
```

## 6. API 范围

### Auth

- `POST /auth/wechat-login`
- 输入：微信登录凭证
- 输出：用户信息、会话信息

### Events

- `GET /events`
- `GET /events/:id`

### Sessions

- `GET /events/:eventId/sessions`
- `GET /sessions/:id`
- `POST /sessions/:id/favorite`

### Ticket

- `POST /events/:eventId/ticket`
- `GET /events/:eventId/ticket`

### Check-in

- `POST /checkin`
- `GET /sessions/:id/checkin-count`

### Realtime

- `WS /realtime`
- 事件类型：
  - `session.count.updated`
  - `checkin.created`

## 7. 实时数据设计

### Redis Key

- `session:{id}:count`
- `event:{id}:global`

### 写入策略

- 签到成功后先写 PostgreSQL
- 再更新 Redis 计数
- 再广播 WebSocket 事件

### 一致性要求

- Redis 只承担实时展示
- PostgreSQL 是唯一事实来源

## 8. 安全要求

- QR Token 必须使用 HMAC 签名
- 签到接口必须校验 Ticket 与 Event 归属关系
- 同一用户同一 Session 的签到必须幂等
- 微信 `openid` 绑定后不可随意覆盖

## 9. 技术约束

### 前端

- Taro
- React
- TypeScript
- Zustand
- TDesign-miniprogram
- Lottie

### 后端

- Bun runtime
- Hono framework

### CMS

- Strapi
- 管理 Event、Session、Speaker

### Realtime

- uWebSockets.js
- Redis

### Database

- PostgreSQL

## 10. 页面结构

- Home：Event 选择
- Agenda：主时间轴
- Session Detail：内容详情
- QR Ticket：二维码展示
- Me：个人中心

## 11. 非功能要求

- Check-in API 响应时间目标：`< 200ms`
- WebSocket 推送延迟目标：`< 100ms`
- 前端页面必须支持移动端首屏可用
- 关键路径不能依赖人工后台操作

## 12. 目录约定

### 前端

- `apps/wechat-miniapp`

### 后端

- `apps/api`

### CMS

- `apps/cms`

### 共享包

- `packages/shared`
- `packages/contracts`
- `packages/config`

## 13. 部署拓扑

```text
Taro UI
  -> Bun API (Hono)
  -> Redis (realtime state)
  -> uWebSockets.js (broadcast)
  -> PostgreSQL (source of truth)
  -> Strapi (content management)
```

## 14. MVP 完成定义

当以下内容全部可用时，MVP 判定完成：

- Event 创建或配置
- Agenda 展示
- Session 详情
- 微信登录
- QR Ticket 生成
- Session Check-in
- 实时人数更新
- 我的页面

## 15. 非目标

以下内容不属于 MVP：

- 推荐算法
- AI 摘要
- 复杂会员体系
- 多活动跨 Event 复用身份
- 离线签到

## 16. 实施顺序建议

1. 定义契约与数据模型
2. 搭 API 与数据库
3. 接入 Redis 和实时广播
4. 实现小程序页面
5. 接入 Strapi 内容管理
6. 补测试与部署
