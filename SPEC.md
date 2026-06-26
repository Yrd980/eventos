# 多活动微信小程序平台 Spec

版本：`v0.2`
目标：定义一个可复用、生产级、面向多公司多活动的微信小程序平台。产品形态参考亚马逊云科技中国峰会小程序的交互与信息架构，但底层必须支持多租户、多活动和企业级复用。

## 1. 产品定位

这是一个活动运营平台，面向企业客户提供可复用的微信小程序能力，用于承载峰会、论坛、展会、发布会、培训、路演等活动。

平台必须支持：

- 多公司复用
- 多活动复用
- 多租户隔离
- 生产级内容管理
- 参会者端与运营端分离
- 可配置的首页、日程、展区、问答、报名、签到、问卷、直播、个人中心
- 生产级数据模型与权限边界
- 可扩展的多活动模板体系

### 1.1 技术选型约束

本项目的技术选型固定如下：

- 前端框架：`Taro`
- 视图层：`React`
- 语言：`TypeScript`
- 状态管理：`Zustand`
- UI 组件：`TDesign-miniprogram`
- 动效：`Lottie`
- 前端构建：`Vite 8`
- 后端运行时：`Bun`
- 后端框架：`Hono`
- 数据访问：`Drizzle ORM`
- 输入校验：`Zod`
- CMS：`TDesign React 管理端`
- 实时服务：`uWebSockets.js`
- 缓存与实时态：`Redis`
- 主数据存储：`PostgreSQL`
- 仓库组织：`Monorepo + workspaces`
- 本地编排：`docker-compose`

### 1.2 工程原则

- 不在页面层堆业务规则
- 不把实时态当成最终事实来源
- 不做 legacy fallback
- 不保留旧 Event OS 兼容层
- 不做多套旧协议并存
- 不把临时脚本混入生产路径
- 不做假数据混入正式流程

### 1.3 页面与配置原则

- 页面不是写死的，必须支持按活动配置开关和顺序调整
- 首页、日程、展区、我的等页面必须支持模块化配置
- 不同活动可以复用同一模板，也可以覆盖局部配置
- 默认文案必须可替换，不能把某个公司的专有文案写死成平台默认值

## 2. 产品参考

本产品的交互参考 AWS 中国峰会小程序，主要借鉴其信息架构：

- 首页入口
- 日程页
- AI 小助手
- 展区页
- 我的页
- 报名、二维码、签到、问卷、直播、个人日程

但本产品不是 AWS 峰会专用，而是一个可以给其他公司复用的通用平台。

## 3. 产品目标

### 必须实现

- 活动列表与活动详情
- 单活动内的首页、日程、展区、我的等页面可配置
- 报名与参会二维码
- 我的日程
- 签到
- 直播 / 在线观看
- 参会指南 / FAQ
- AI 小助手
- 问卷
- 生产级内容管理
- 多租户隔离

### 验收标准

- 一个租户可以创建和管理多个活动
- 一个活动可以配置首页、日程、展区、问卷、直播等模块
- 参会者可以进入某个活动并完成报名
- 参会者可查看参会二维码
- 参会者可把日程加入我的日程
- 参会者可扫码签到
- 参会者可打开 AI 小助手
- 运营人员可在 CMS 中配置活动内容

## 4. 术语统一

- `租户`：一个企业客户或组织
- `活动`：一次具体峰会、论坛、展会、发布会或培训
- `活动实例`：某个活动的可运行配置
- `日程项`：活动中的单条 session、议程或演讲
- `我的日程`：用户加入的日程项
- `参会二维码`：用户在某个活动下的身份凭证
- `展区`：活动中的 expo / booth / 展台区域
- `AI 小助手`：活动内会务问答与导览入口

## 5. 平台范围

### 5.1 参会者端

- 活动选择
- 活动首页
- 日程浏览
- 日程详情
- 我的日程
- AI 小助手
- 展区
- 报名
- 参会二维码
- 签到
- 直播 / 在线观看
- 参会指南
- 我的问卷
- 我的报名

## 5.4 复用模式

平台支持以下复用方式：

- 同租户多活动复用同一模板
- 不同租户复用同一活动模板
- 同一活动按场景切换页面模块
- 同一活动按运营阶段切换文案、banner、入口和推荐内容

复用时必须保留：

- 租户隔离
- 活动隔离
- 用户身份隔离
- 数据归属隔离
- 模块配置独立性

### 5.2 运营端

- 活动创建
- 活动配置
- 首页配置
- 日程配置
- 展区配置
- 问卷配置
- 直播配置
- 报名配置
- 签到配置
- 内容发布
- 实时态查看
- 模板管理
- 页面开关管理
- 文案与视觉配置
- 权限与角色管理
- 首页轮播配置
- 快捷入口配置
- 日程分组配置
- 展区排序配置
- 问卷挂载配置
- 直播挂载配置

### 5.3 系统端

- 多租户隔离
- 内容与实时态分离
- 可审计
- 可观测
- 可回放
- 可配置
- 可扩展
- 可追踪
- 可迁移
- 可回滚

## 6. 业务模型

### 6.1 租户

```ts
type Tenant = {
  id: string;
  name: string;
  code: string;
  status: "active" | "paused";
};
```

### 6.2 活动

```ts
type Activity = {
  id: string;
  tenant_id: string;
  name: string;
  theme: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string;
  status: "draft" | "published" | "archived";
  template_key: string;
  cover_image?: string;
};
```

### 6.3 活动页面配置

```ts
type ActivityPageConfig = {
  id: string;
  activity_id: string;
  page_key: "home" | "agenda" | "assistant" | "expo" | "me";
  enabled: boolean;
  config_json: Record<string, unknown>;
};

### 6.3.1 活动模板

```ts
type ActivityTemplate = {
  id: string;
  tenant_id: string;
  name: string;
  template_key: string;
  description: string;
  config_json: Record<string, unknown>;
};
```

### 6.3.2 页面模块配置

```ts
type PageModuleConfig = {
  id: string;
  activity_id: string;
  page_key: "home" | "agenda" | "assistant" | "expo" | "me";
  module_key: string;
  enabled: boolean;
  sort_order: number;
  config_json: Record<string, unknown>;
};
```

### 6.4 日程项

```ts
type AgendaItem = {
  id: string;
  activity_id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  room: string;
  speaker: string;
  track: string;
  type: string;
  is_live: boolean;
  is_featured: boolean;
  sort_order: number;
};
```

### 6.5 用户

```ts
type User = {
  id: string;
  authing_user_id: string;
  nickname?: string;
  avatar_url?: string;
};

### 6.5.1 角色

```ts
type UserRole = "attendee" | "organizer" | "admin";
```

### 6.6 报名记录

```ts
type Registration = {
  id: string;
  activity_id: string;
  user_id: string;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
  source: "miniapp" | "admin" | "import";
};
```

### 6.7 参会二维码

```ts
type QRPass = {
  id: string;
  activity_id: string;
  participant_id: string;
  registration_id: string;
  status: "active" | "invalidated" | "expired";
  token_fingerprint: string;
  issued_at: string;
  invalidated_at?: string;
  expires_at?: string;
};
```

### 6.8 我的日程

```ts
type MyAgendaItem = {
  id: string;
  activity_id: string;
  user_id: string;
  agenda_item_id: string;
  created_at: string;
  source: "manual" | "smart" | "import";
};
```

### 6.9 签到记录

```ts
type Checkin = {
  id: string;
  activity_id: string;
  user_id: string;
  agenda_item_id: string;
  created_at: string;
  checked_in_by?: string;
  checkin_source: "qr" | "admin" | "self";
};
```

### 6.10 展区

```ts
type ExpoBooth = {
  id: string;
  activity_id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  sponsor_name: string;
  logo_url?: string;
  sort_order: number;
};
```

### 6.11 问卷

```ts
type Survey = {
  id: string;
  activity_id: string;
  title: string;
  description: string;
  target_type: "agenda_item" | "booth" | "activity";
  status: "draft" | "published" | "closed";
};
```

## 7. 一级页面

### 7.1 活动列表页

用于展示租户下可访问的活动。

必须包含：

- 活动卡片
- 活动名称
- 时间
- 地点
- 主题
- 进入活动
- 活动状态
- 活动封面
- 活动标签
- 模板标识

### 7.2 活动首页

活动首页是单个活动的入口页。

必须包含：

- 主视觉 banner 或轮播
- 活动名称、主题、时间、地点
- `立即报名`
- `在线观看`
- 快捷入口
  - 日程
  - AI 小助手
  - 展区
  - 我的二维码
- 活动亮点
- 直播或推荐内容
- 峰会 / 活动介绍
- 个人化入口文案
- 可配置模块开关

### 7.3 日程页

必须包含：

- `全部日程 / 我的日程` 切换
- 日期切换
- 时间轴展示
- 日程卡片
- 手动添加日程
- 查看详情
- 在线观看
- 问卷入口
- 角色筛选
- 主题筛选
- 直播中状态
- 收藏状态
- 已结束 / 进行中状态区分
- 智能添加推荐
- 收藏状态

### 7.4 AI 小助手页

必须包含：

- 欢迎语
- 预置问题按钮
- 输入框
- 会务问答
- 日程推荐
- 交通、场馆、签到、报名问答
- 跳转入口
- 会话上下文
- 常见问题快捷回复
- 活动内检索
- 会话上下文
- 活动内检索
- 常见问题快捷回复

### 7.5 展区页

必须包含：

- 展区总览
- 展商 / 展位列表
- 展位详情
- 分类标签
- 导览入口
- 赞助商入口
- 展位封面
- 展位排序
- 赞助商入口
- 展位排序
- 展位封面

### 7.6 我的页

必须包含：

- 用户头像与昵称
- 参会二维码
- 我的日程
- 我的报名
- 我的展位
- 我的问卷
- 好友报名数
- 一键智能添加日程
- 分享入口
- 扫码签到入口
- 个人状态
- 待办提醒
- 当前活动切换
- 未读提醒

### 7.7 详情页

至少包含：

- 活动详情页
- 日程详情页
- 展位详情页
- 报名页
- 参会二维码页
- 签到页
- 参会指南页
- 直播 / 在线观看页

## 8. 页面行为

### 8.1 活动列表页

- 点击活动进入活动首页
- 活动可按租户配置展示
- 列表支持分页或无限滚动
- 支持置顶活动

### 8.2 活动首页

- 点击报名进入报名流程
- 点击在线观看进入直播或回放
- 点击日程进入日程页
- 点击 AI 小助手进入问答页
- 点击展区进入展区页
- 点击我的进入个人中心
- 根据活动配置显示或隐藏模块
- 支持不同活动模板的首页布局

### 8.3 日程页

- `全部日程` 显示活动内全部日程
- `我的日程` 显示用户已加入日程
- 切换日期刷新列表
- 点击日程卡片进入详情
- 点击加入按钮加入我的日程
- 点击移除按钮移除日程
- 已结束日程与进行中日程状态区分
- 支持手动添加与智能推荐添加

### 8.4 AI 小助手页

- 预置问题可一键发送
- 支持文本输入
- 支持返回会务说明、参会指南、日程建议
- 支持跳转到报名、日程、展区、直播
- 支持活动上下文记忆
- 支持常见问答词库

### 8.5 展区页

- 浏览展区列表
- 查看展位详情
- 进入相关内容页
- 支持展区分类和排序
- 支持赞助商展示位

### 8.6 我的页

- 查看参会二维码
- 查看报名状态
- 查看我的日程、我的展位、我的问卷
- 执行一键智能添加日程
- 查看个人会话状态
- 查看未读提醒

## 9. 公开可确认的功能范围

来自 AWS 官方公开页面，平台应支持的标准能力包括：

- 峰会概览
- 大会日程
- Expo / 展区
- AI League
- 赞助商
- 参会指南
- 收藏 session 到个人日程
- 导航会场
- 活动通知
- 直播 / 在线观看

## 10. 截图确认的功能范围

来自用户提供截图，平台 UI 必须支持：

- 首页主视觉
- 立即免费报名
- 在线观看
- 全部日程 / 我的日程
- 日期切换
- 时间轴
- 手动添加日程
- AI 小助手
- 参会二维码
- 我的报名
- 我的展位
- 我的问卷
- 好友报名数
- 一键智能添加日程

## 11. 数据与状态原则

- PostgreSQL 是最终事实来源
- Redis 只存实时态
- 签到必须幂等
- 参会二维码必须可验证且不可伪造
- 我的日程和报名状态必须可回放或重建
- 多租户数据必须隔离
- 活动配置必须可版本化
- 页面配置必须可开关
- 运营端改动必须可审计
- 关键操作必须可追踪
- 核心业务资源必须强类型建模，Page Config / Block 只负责展示编排和资源引用
- 所有改变业务事实的操作必须通过 Command、幂等键、权限校验和领域错误码

### 11.1 实时数据设计

- `session:{id}:count` 存储单个日程项实时人数
- `activity:{id}:stats` 存储活动级实时统计
- `ws` 负责推送增量更新
- `PostgreSQL` 负责最终落库
- 直播中、签到成功、日程更新等事件都应能广播

### 11.2 安全要求

- 登录、微信小程序身份绑定和通用权限来源由 Authing 承担
- Event OS 本地只保存 Authing User / Organization 的必要投影
- QR Token 必须使用签名校验
- 报名接口必须校验活动归属
- 签到接口必须校验二维码与活动、日程归属关系
- 管理端必须有角色权限控制
- 运营端敏感操作必须记录审计日志
- 活动配置必须可版本化
- 页面配置必须可开关
- 运营端改动必须可审计
- 关键操作必须可追踪
- 核心业务资源必须强类型建模，Page Config / Block 只负责展示编排和资源引用
- 所有改变业务事实的操作必须通过 Command、幂等键、权限校验和领域错误码

## 11.1 实时数据设计

- `session:{id}:count` 存储单个日程项实时人数
- `activity:{id}:stats` 存储活动级实时统计
- `ws` 负责推送增量更新
- `PostgreSQL` 负责最终落库
- 直播中、签到成功、日程更新等事件都应能广播

## 11.2 安全要求

- 登录、微信小程序身份绑定和通用权限来源由 Authing 承担
- Event OS 本地只保存 Authing User / Organization 的必要投影
- QR Token 必须使用签名校验
- 报名接口必须校验活动归属
- 签到接口必须校验二维码与活动、日程归属关系
- 管理端必须有角色权限控制
- 运营端敏感操作必须记录审计日志

## 12. 接口范围

### 12.1 租户与活动

- `GET /tenants/:id/activities`
- `GET /activities/:id`
- `GET /activities/:id/pages`
- `POST /activities`
- `PATCH /activities/:id`
- `POST /activities/:id/publish`

### 12.2 日程

- `GET /activities/:id/agenda`
- `GET /agenda/:id`
- `POST /agenda/:id/join`
- `POST /agenda/:id/leave`
- `POST /agenda`
- `PATCH /agenda/:id`
- `DELETE /agenda/:id`

### 12.3 用户与报名

- Authing 小程序登录后由 API 校验 Authing token
- `POST /activities/:id/register`
- `GET /activities/:id/registration`
- `GET /users/me`
- `PATCH /users/me`

### 12.4 参会二维码

- `GET /activities/:id/qr-pass`

### 12.5 展区

- `GET /activities/:id/expo`
- `GET /expo/:id`
- `POST /expo`
- `PATCH /expo/:id`
- `DELETE /expo/:id`

### 12.6 问卷

- `GET /activities/:id/surveys`
- `GET /agenda/:id/survey`
- `GET /expo/:id/survey`
- `POST /surveys`
- `PATCH /surveys/:id`
- `DELETE /surveys/:id`

### 12.7 签到

- `POST /checkin`
- `GET /agenda/:id/checkin-count`

### 12.8 AI 小助手

- `POST /assistant/chat`
- `GET /assistant/faq`

### 12.9 实时

- `WS /realtime`
- `GET /realtime/health`

## 13. 业务边界

### 必做

- 多租户活动列表
- 活动首页
- 日程
- AI 小助手
- 展区
- 我的
- 报名
- 二维码
- 签到
- 直播 / 在线观看
- 问卷
- CMS 管理端可配置
- 实时广播
- 审计日志
- 权限控制
- 模板复用

### 不做

- 单活动专用产品语义
- legacy fallback
- 旧 Event OS 兼容层
- 多套旧协议并存
- 纯演示假数据混入生产路径
- 推荐算法
- AI 摘要
- 离线签到

## 14. 页面优先级

1. 活动列表
2. 活动首页
3. 日程
4. 我的
5. AI 小助手
6. 展区
7. 报名
8. 二维码
9. 签到

## 15. MVP 完成定义

当以下能力可用时，MVP 完成：

- 租户可创建活动
- 活动可配置首页、日程、展区、我的等模块
- 参会者可进入活动
- 参会者可浏览日程
- 参会者可加入我的日程
- 参会者可打开 AI 小助手
- 参会者可浏览展区
- 参会者可报名
- 参会者可查看参会二维码
- 参会者可扫码签到
- 参会者可查看直播或在线观看入口
- 运营端可在 CMS 管理端中管理活动内容
- 活动页面可以通过模板快速复用
- 关键数据和状态可以审计和追踪
- 活动配置修改后可尽量在线生效

## 16. 非功能要求

- 首屏可用时间需适配移动端
- 页面交互必须支持移动端触控
- 关键页面需支持空状态、加载态、错误态
- 实时人数更新应可见
- 日程签到链路应低延迟
- 运营配置修改后应尽量实时生效
- 所有核心接口应具备基本可观测性
- 小程序页面结构应支持后续品牌换肤和活动模板扩展
- 页面配置变更后前端应可刷新或重载获取最新配置
- 页面模块开关变化应尽量无需发版

## 17. 文案原则

- 文案必须支持多公司复用，不写死单一品牌语义
- 首页、日程、我的、展区、AI 小助手都应支持活动级定制文案
- 系统默认文案要偏中性、专业、可配置
- 不要把 AWS 峰会专有内容写死到平台默认值里
- 默认模板与品牌模板要分离

## 18. 实施顺序建议

1. 先定租户、活动、日程、报名、二维码的数据契约
2. 再做活动列表、活动首页、日程、我的
3. 再做报名、签到、二维码
4. 再做 AI 小助手和展区
5. 最后补问卷、直播、实时态、运营后台配置
