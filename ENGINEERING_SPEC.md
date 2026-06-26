# Event OS 工程约束说明

本文档用于指导 Codex 直接实现项目，不负责解释产品背景，只定义可执行边界。

## 1. 工程目标

实现一个可运行的 Event OS 微信小程序 + API + CMS + Realtime 基础工程，满足：

- 可按 Tenant 入口选择或直达 Activity
- 可浏览 Activity Home、Agenda、Session
- 可通过 Authing 登录和绑定微信小程序身份
- 可完成 Registration 并获得 QR Pass
- 可加入 Session 到 My Agenda
- 可由 Staff 对 Session 执行 Check-in
- 可实时显示 Session Check-in count

## 2. 总体架构

```text
Wechat Mini Program
  -> Bun API (Hono)
  -> PostgreSQL
  -> Redis
  -> uWebSockets.js
  -> TDesign React CMS admin
```

## 3. 代码边界

### 3.1 前端

职责：

- 页面渲染
- 状态管理
- 登录交互
- QR Pass 展示
- Check-in 入口
- Realtime 消费

禁止：

- 直接写数据库
- 直接操作 CMS 私有逻辑
- 在页面中堆业务规则

### 3.2 API

职责：

- 鉴权
- Activity / Registration / QR Pass / My Agenda / Check-in 业务规则
- Authing token、Tenant scope、Operator/Staff permission 校验
- Redis 读写
- PostgreSQL 持久化

禁止：

- 把实时状态当成事实来源
- 把前端参数直接透传到数据库

### 3.3 CMS

职责：

- 管理 Activity
- 管理 Session
- 管理 Speaker
- 管理 Organizer、Sponsor、Expo Booth、Live Entry、Survey、Notification、Page Config
- 管理 draft，并发布 Activity-level published version

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
- 鉴权: Authing identity + Event OS 本地 User 投影 + Tenant/Activity scoped permission
- 响应: 成功 `{ data, meta? }`，失败 `{ error: { code, message, details?, trace_id? } }`
- 写操作: Command + `idempotency_key`

### 4.2 Realtime 服务

- 基于 `uWebSockets.js`
- 通过 Redis 订阅变更
- 向客户端广播 session 计数更新

### 4.3 前端

- Framework: `React + TypeScript`
- State: `Zustand`
- UI: `TDesign React`
- Animation: `Lottie`

## 5. 数据库约束

### 5.1 PostgreSQL 是最终事实来源

以下数据必须落库：

- users
- tenants
- organizers
- sponsors
- activities
- activity_publications
- sessions
- speakers
- registrations
- qr_passes
- my_agenda_items
- checkins
- checkin_attempts
- expo_booths
- live_entries
- surveys
- notifications
- audit_events

### 5.2 Redis 只放实时态

以下数据只允许作为缓存或实时态：

- session count
- activity rebuildable stats
- websocket publish state

## 6. 唯一性约束

- `user.authing_user_id` 唯一
- `tenant.authing_org_id` 唯一
- `registration(participant_id, activity_id)` 唯一
- `qr_pass(registration_id)` 当前有效记录唯一
- `my_agenda_item(participant_id, session_id)` 唯一
- `checkin(participant_id, session_id)` 唯一
- `qr_token` 不等于实体 ID，必须可验证且不可预测；只保存 fingerprint 或安全校验材料

## 7. 接口命名

### Auth

- Authing 负责登录和微信小程序身份绑定
- API 接收并校验 Authing-issued token

### Activities

- `GET /activities`
- `GET /activities/:id`
- `GET /activities/:id/publication`

### Sessions

- `GET /activities/:activityId/sessions`
- `GET /sessions/:id`
- `POST /sessions/:id/my-agenda`
- `DELETE /sessions/:id/my-agenda`

### Registration

- `POST /activities/:activityId/registration`
- `GET /activities/:activityId/registration`

### QR Pass

- `GET /activities/:activityId/qr-pass`

### Check-in

- `POST /checkin`
- `GET /sessions/:id/checkin-count`

### Realtime

- `WS /realtime`

## 8. 状态更新顺序

签到成功必须按以下顺序执行：

1. 验证 Authing Staff identity 和 Activity-scoped Staff permission
2. 验证 QR Pass 当前有效
3. 验证 Registration 为 `confirmed`
4. 校验 QR Pass / Participant / Session / Staff scope 都属于同一 Activity
5. 幂等写 PostgreSQL checkin
4. 更新 Redis count
5. 广播 realtime 事件

如果 PostgreSQL checkin 写入失败，后续 Redis 与 realtime 步骤不能执行。关键失败写入 Check-in Attempt 或 Audit Event。

## 9. 前端页面顺序

1. Home / Activity 选择
2. Agenda
3. Session Detail
4. QR Pass
5. Me

## 10. 组件边界

必须拆分为以下复用组件：

- `SessionCard`
- `TrackSection`
- `QRCard`
- `CheckInBadge`

## 11. 验收测试点

- Activity 列表可加载
- Session 可按 Activity 过滤
- Registration 可创建且默认 confirmed
- QR Pass 可签发和展示
- My Agenda 可添加且去重
- QR 可显示
- Check-in 可去重
- Redis count 可更新
- 客户端可收到实时事件
- Audit Event 可记录关键状态变化

## 12. 生产级要求

- 所有输入必须校验
- 所有签到写操作必须幂等
- 所有 QR 必须可签名校验
- 所有实时更新必须可回放或可重建
- 所有核心接口必须可观察

## 12.1 测试与验收分层

自动化测试负责快速、确定性的验证：

- API 领域规则：Registration、QR Pass、My Agenda、Check-in、权限、幂等、错误码
- contracts：请求/响应 envelope、Domain Error Code、Realtime payload
- 服务端集成闭环：报名、签发 QR Pass、加入 My Agenda、Staff 签到、Realtime count 事件
- 可在浏览器、H5 或组件层稳定运行的 UI 状态测试

真实小程序体验不强求由 agent 控制电脑桌面自动点击。微信授权、扫码、真机触控、相机权限、弱网与现场操作手感通过 Manual UX Acceptance 验证，由用户在 Codex App、微信开发者工具或真机里执行。

Manual UX Acceptance 按角色任务流编写，不按页面清单编写：

- Participant：进入 Activity、浏览 Home/Agenda、登录报名、查看 QR Pass、加入 My Agenda、查看 Me
- Staff：进入 Activity/Session 签到入口、扫码、看到成功/重复/失败原因、确认 Realtime count 更新
- Operator：创建或编辑 Activity/Session/Page Config、发布、确认小程序端看到新 published version、修改后再次发布并确认更新

## 13. 不做的事

- 不做 legacy fallback
- 不做兼容多套旧协议
- 不做临时脚本
- 不做假数据混入生产逻辑
