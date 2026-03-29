# 未雨课表

一个基于微信原生小程序与微信云开发构建的学习管理工具，面向需要长期、自主、规律学习的用户，帮助把课程计划、日常打卡、学分反馈和奖励目标串成一个持续运转的闭环。

## 项目简介

未雨课表不是传统意义上的学校课表，而是一个更贴近成人长期学习场景的小程序：

- 用共享课程库沉淀可复用的学习内容
- 用个人课表把学习计划真正排进日程
- 用上课 / 下课打卡记录真实投入
- 用学分、奖励和统计建立持续反馈

当前版本已经具备从课程录入、课表编排、打卡记录到统计反馈的完整主流程。

## 功能特性

### 首页总览

- 今日学习安排
- 本周进度概览
- 主奖励进度展示
- 最近学习记录摘要
- 下一节课程提醒

### 课程与课表

- 共享课程库浏览
- 新增 / 编辑课程
- 课程详情查看
- 固定学习排期编排
- 已排课程分组展示

### 学习打卡

- 上课打卡
- 下课打卡
- 学习记录沉淀
- 请假 / 休息 / 旷课状态管理
- 课程完成学分自动结算

### 个人中心

- 个人资料编辑
- 学分规则配置
- 奖励目标配置
- 数据统计中心
- 多主题界面切换

## 核心流程

```text
课程录入 -> 课表编排 -> 每日打卡 -> 学分累计 -> 奖励进度 -> 统计复盘
```

## 技术栈

- 前端：微信原生小程序
- 后端：微信云开发
- 数据库：云开发数据库
- 云函数：`quickstartFunctions`
- 登录机制：通过云函数获取当前微信用户 `openid`

## 项目结构

```text
weiyukebiao/
├── cloudfunctions/
│   └── quickstartFunctions/   # 云函数，当前主要用于获取 openid
├── miniprogram/
│   ├── pages/                 # 页面代码
│   ├── utils/                 # 公共工具与业务逻辑
│   ├── app.js                 # 小程序启动入口
│   ├── app.json               # 页面与 tab 配置
│   └── app.wxss               # 全局样式
├── project.config.json        # 微信开发者工具配置
├── project.private.config.json
├── uploadCloudFunction.sh     # 云函数部署辅助脚本
└── README.md
```

## 页面说明

### Tab 页面

- `pages/home/index`：首页
- `pages/course/index`：课程与个人课表
- `pages/checkin/index`：今日打卡
- `pages/profile/index`：个人中心

### 非 Tab 页面

- `pages/course-detail/index`：课程详情
- `pages/course-edit/index`：新增 / 编辑课程
- `pages/schedule-edit/index`：新增 / 编辑课表排期
- `pages/profile-edit/index`：个人资料编辑
- `pages/reward-edit/index`：奖励目标设置
- `pages/credit-rule/index`：学分规则设置
- `pages/stats/index`：统计中心
- `pages/theme-settings/index`：主题切换

## 数据设计

当前项目主要使用以下集合：

### `users`

用户资料表，按 `openid` 存储基础用户信息。

核心字段：

- `openid`
- `nickname`
- `avatarUrl`
- `intro`
- `createdAt`
- `updatedAt`

### `courses`

共享课程库，所有用户可见。

核心字段：

- `name`
- `category`
- `totalDuration`
- `description`
- `link`
- `materials`
- `tags`
- `notes`
- `colorKey`
- `colorName`
- `colorClass`

### `user_course_plans`

个人课表排期表，按 `openid` 隔离。

核心字段：

- `openid`
- `courseId`
- `courseName`
- `weekday`
- `weekdayLabel`
- `startDate`
- `endDate`
- `startTime`
- `endTime`
- `status`
- `note`

### `checkins`

学习打卡与学习记录表，按 `openid` 隔离。

核心字段：

- `openid`
- `planId`
- `courseId`
- `courseName`
- `dateKey`
- `status`
- `plannedMinutes`
- `actualMinutes`
- `studyNote`
- `leaveReason`
- `earnedCredits`
- `startedAt`
- `finishedAt`

### `credit_rules`

个人学习规则表，按 `openid` 隔离。

核心字段：

- `openid`
- `completionCredits`
- `deepStudyThreshold`
- `deepStudyBonus`
- `missedPenalty`
- `restMonthlyLimit`
- `manualAdjustment`

### `rewards`

个人奖励目标表，按 `openid` 隔离。

核心字段：

- `openid`
- `title`
- `targetCredits`
- `description`
- `manualAdjustment`

## 数据隔离策略

### 共享数据

- `courses`

### 用户隔离数据

- `users`
- `user_course_plans`
- `checkins`
- `credit_rules`
- `rewards`

当前登录流程：

1. 小程序启动后调用云函数 `quickstartFunctions`
2. 获取当前微信用户的 `openid`
3. 自动在 `users` 集合中创建或读取个人档案
4. 后续业务数据统一按 `openid` 隔离

## 主题系统

当前已内置 10 套主题配色：

- 草莓熊
- 松林绿
- 海盐蓝
- 焦糖杏
- 石墨灰
- 夜幕黑
- 雾紫
- 薄荷青
- 酒红
- 沙丘金

主题入口：

```text
我的 -> 界面配色
```

## 本地开发

### 环境要求

- 微信开发者工具
- 已开通并配置微信云开发环境

### 启动方式

在微信开发者工具中打开本项目根目录：

```text
weiyukebiao/
```

### 云环境

当前代码中配置的云环境：

```text
cloud1-1g2x48ece3357f4f
```

配置位置：

- `miniprogram/app.js`

### 云函数

当前云函数目录：

```text
cloudfunctions/quickstartFunctions
```

如果修改了云函数代码，需要在微信开发者工具中重新部署。

## 运行说明

### 小程序端

- 页面配置见 `miniprogram/app.json`
- 采用原生小程序页面结构开发
- 已启用 `lazyCodeLoading: "requiredComponents"`

### 云函数端

当前 `quickstartFunctions` 主要承担：

- 获取当前用户 `openid`
- 提供基础的云开发示例能力

如果项目继续演进，建议将统计、聚合和复杂查询逻辑逐步下沉到云函数侧。

## 适用场景

- 自学型长期学习计划
- 在职提升、考证、转岗准备
- 需要稳定追踪投入与进度的个人学习管理
- 希望把课程、打卡、奖励和统计统一管理的微信内工具

## 后续优化方向

- 云函数化统计聚合，减少前端全量查询
- 更细粒度的课表视图与冲突检测
- 多维度学习报表
- 课程资料能力增强
- 更完整的发布与部署说明

## License

当前仓库未附带独立开源许可证。如需公开分发或商用，请先补充对应 License 文件。
