# Event OS 工程约束说明

本文档用于指导 Codex 直接实现项目，不负责解释产品背景，只定义可执行边界。

## 1. 工程目标

实现一个可运行的 Event OS 微信小程序 + API + CMS + Realtime 基础工程，满足：

- 可选 Event
- 可看 Agenda
- 可看 Session
- 可登录
- 可生成 Ticket
- 可签到
- 可实时显示人数

## 2. 总体架构

```text
Wechat Mini Program
  -> Bun API (Hono)
  -> PostgreSQL
  -> Redis
  -> uWebSockets.js
  -> Strapi CMS
```

## 3. 代码边界

### 3.1 前端

职责：

- 页面渲染
- 状态管理
- 登录交互
- Ticket 展示
- Check-in 入口
- Realtime 消费

禁止：

- 直接写数据库
- 直接操作 Strapi 私有逻辑
- 在页面中堆业务规则

### 3.2 API

职责：

- 鉴权
- Event / Session / Ticket / Check-in 业务规则
- Redis 读写
- PostgreSQL 持久化

禁止：

- 把实时状态当成事实来源
- 把前端参数直接透传到数据库

### 3.3 CMS

职责：

- 管理 Event
- 管理 Session
- 管理 Speaker

禁止：

- 承担签到核心流程
- 直接暴露可伪造的身份凭证

### 3.4 Realtime

职责：

- 广播签到事件
- 广播人数变化
- 向前端推送增量更新

禁止：

- 充当最终数据存储
- 存放复杂业务规则

## 4. 服务约定

### 4.1 API 服务

- Runtime: `Bun`
- Framework: `Hono`
- 输入输出: JSON
- 鉴权: 微信登录态 + 服务端会话

### 4.2 Realtime 服务

- 基于 `uWebSockets.js`
- 通过 Redis 订阅变更
- 向客户端广播 session 计数更新

### 4.3 前端

- Framework: `Taro + React + TypeScript`
- State: `Zustand`
- UI: `TDesign-miniprogram`
- Animation: `Lottie`

## 5. 数据库约束

### 5.1 PostgreSQL 是最终事实来源

以下数据必须落库：

- users
- events
- sessions
- tickets
- checkins
- favorites

### 5.2 Redis 只放实时态

以下数据只允许作为缓存或实时态：

- session count
- event global stats
- websocket publish state

## 6. 唯一性约束

- `openid` 唯一
- `ticket(user_id, event_id)` 唯一
- `checkin(user_id, session_id)` 唯一
- `qr_token` 必须可验证且不可预测

## 7. 接口命名

### Auth

- `POST /auth/wechat-login`

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

## 8. 状态更新顺序

签到成功必须按以下顺序执行：

1. 验证 ticket
2. 校验 session/event 归属
3. 写 PostgreSQL checkin
4. 更新 Redis count
5. 广播 realtime 事件

如果第 3 步失败，后续步骤不能执行。

## 9. 前端页面顺序

1. Home / Event 选择
2. Agenda
3. Session Detail
4. QR Ticket
5. Me

## 10. 组件边界

必须拆分为以下复用组件：

- `SessionCard`
- `TrackSection`
- `QRCard`
- `CheckInBadge`

## 11. 验收测试点

- Event 列表可加载
- Session 可按 Event 过滤
- Ticket 可生成
- QR 可显示
- Check-in 可去重
- Redis count 可更新
- 客户端可收到实时事件

## 12. 生产级要求

- 所有输入必须校验
- 所有签到写操作必须幂等
- 所有 QR 必须可签名校验
- 所有实时更新必须可回放或可重建
- 所有核心接口必须可观察

## 13. 不做的事

- 不做 legacy fallback
- 不做兼容多套旧协议
- 不做临时脚本
- 不做假数据混入生产逻辑
