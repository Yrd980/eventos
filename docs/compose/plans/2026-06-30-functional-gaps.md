# Functional Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task.

**Goal:** Close all 21 functional gaps between current Event OS mini program and reference design.

**Architecture:** Extend existing Taro/React pages with new components, add missing API functions for speakers/live-entries/surveys, create global Bottom TabBar, and restructure AI assistant into chat interface.

**Tech Stack:** Taro + React, TypeScript, CSS variables, existing API utils pattern.

## Global Constraints
- Follow existing code conventions (CSS variables, component patterns, API utils)
- No new dependencies unless already in package.json
- All new API functions follow `cachedRead` / `apiRequest` pattern
- Speaker data comes from `Speaker` + `SessionSpeaker` contracts (need new API endpoints)
- Live entries per session: filter by `LiveEntry.session_id`
- Surveys per session: filter by `Survey.target_type === 'session'` + `Survey.target_id`

---

## Task 1: Add Speaker API Functions

**Files:**
- Modify: `apps/web-miniapp/src/utils/api.ts`

**Steps:**
- [ ] Add `loadSpeakers(activityId)` function
- [ ] Add `loadSessionSpeakers(sessionId)` function
- [ ] Add `loadSpeaker(speakerId)` function

## Task 2: Create Bottom TabBar Component

**Files:**
- Create: `apps/web-miniapp/src/components/tab-bar/index.tsx`
- Create: `apps/web-miniapp/src/components/tab-bar/index.css`
- Modify: All page files to use TabBar

**Steps:**
- [ ] Create TabBar component with 5 tabs (首页/日程/AI助手/展区/我的)
- [ ] Add active state highlighting based on current page
- [ ] Integrate into all pages

## Task 3: Enhance Home Page

**Files:**
- Modify: `apps/web-miniapp/src/pages/index/index.tsx`
- Modify: `apps/web-miniapp/src/pages/index/index.css`

**Steps:**
- [ ] Add Speaker carousel/rotation in hero area
- [ ] Add "分享好友" share button (WeChat share API)
- [ ] Add "白皮书下载" link (placeholder)
- [ ] Add AI input bar at bottom ("请帮我报名")
- [ ] Add TabBar integration

## Task 4: Enhance Schedule Page

**Files:**
- Modify: `apps/web-miniapp/src/pages/schedule/index.tsx`
- Modify: `apps/web-miniapp/src/pages/schedule/index.css`

**Steps:**
- [ ] Load speakers for sessions and display on cards
- [ ] Add "线上观看" button per session (link to LiveEntry)
- [ ] Add "问卷" action per session (link to Survey)
- [ ] Add "+日程" quick action on cards
- [ ] Add TabBar integration

## Task 5: Enhance My Schedule Page

**Files:**
- Modify: `apps/web-miniapp/src/pages/schedule/index.tsx`

**Steps:**
- [ ] Add "精彩议程陆续上新中" banner in "我的日程" view
- [ ] Add "手动添加" floating button (custom schedule item)
- [ ] Add "线上观看" button on session cards

## Task 6: Rewrite AI Assistant

**Files:**
- Modify: `apps/web-miniapp/src/pages/assistant/index.tsx`
- Modify: `apps/web-miniapp/src/pages/assistant/index.css`

**Steps:**
- [ ] Create chat-like interface with message bubbles
- [ ] Add welcome message with summit info
- [ ] Add 6 quick action buttons (gradient chips):
  - 智能推荐参会日程
  - 管理和调整已添加的日程安排
  - 智能推荐展区与互动体验
  - 峰会大会亮点
  - 场馆、交通及签到信息
  - 报名与参会方式
- [ ] Add bottom toolbar (线上观看/参会二维码/峰会首页/全部)
- [ ] Add AI input bar
- [ ] Implement basic response logic for each action

## Task 7: Restructure Me Page

**Files:**
- Modify: `apps/web-miniapp/src/pages/me/index.tsx`
- Modify: `apps/web-miniapp/src/pages/me/index.css`

**Steps:**
- [ ] Add "好友报名数" display with count
- [ ] Add "继续邀约" share button
- [ ] Add "一键智能添加日程" button
- [ ] Restructure tabs: 参会二维码/我的日程/我的报名/我的展位/我的问卷
- [ ] Add user name + organization on QR card
- [ ] Add TabBar integration

## Task 8: Add Manual Schedule Add

**Files:**
- Modify: `apps/web-miniapp/src/pages/schedule/index.tsx`

**Steps:**
- [ ] Create floating "+" button
- [ ] Create modal/form for custom schedule entry
- [ ] Store locally (no backend API for custom items)

## Task 9: Add Session-to-Live/Survey Links

**Files:**
- Modify: `apps/web-miniapp/src/utils/api.ts`

**Steps:**
- [ ] Add `loadSessionLiveEntries(sessionId)` - filter LiveEntry by session_id
- [ ] Add `loadSessionSurveys(sessionId)` - filter Survey by target_type='session' + target_id
