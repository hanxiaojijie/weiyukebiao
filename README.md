# 未雨课表

一个基于微信原生小程序 + 微信云开发实现的学习管理工具，面向需要长期、自主、规律学习的职场人。

当前这版已经完成第一阶段核心闭环：
- 共享课程库
- 个人课表排期
- 上课打卡 / 下课打卡
- 学习记录
- 学分规则
- 主奖励进度
- 统计中心
- 微信 `openid` 登录与个人数据隔离

## 项目定位

未雨课表不是传统的“学校课程表”，而是一个偏长期学习管理的小程序。

核心目标：
- 把想学的内容整理成共享课程库
- 把个人学习计划稳定落到课表里
- 用打卡、学分和奖励进度形成持续反馈
- 帮助用户看见自己的积累，而不是只靠临时冲劲

## 技术方案

- 前端：微信原生小程序
- 后端：微信云开发
- 数据库：云开发数据库
- 云函数：`quickstartFunctions`
- 登录：基于云函数获取当前微信用户 `openid`

当前云环境：
- `cloud1-1g2x48ece3357f4f`

说明：
- 小程序页面代码在微信平台发布后运行在用户微信里
- 数据库和云函数运行在微信云开发环境里
- 不需要单独购买或维护自建服务器

## 当前功能

### 1. 首页
- 今日总览
- 今日进度
- 主奖励进度
- 今日学习安排
- 最近学习记录

### 2. 课程
- 个人课表
- 共享课程库
- 已排课程
- 课程详情
- 录入课程 / 编辑课程

### 3. 打卡
- 上课打卡
- 下课打卡
- 学习记录
- 请假 / 休息 / 旷课

### 4. 我的
- 个人信息
- 学习规则
- 奖励目标
- 统计中心
- 界面配色

## 页面结构

Tab 页：
- `pages/home/index`
- `pages/course/index`
- `pages/checkin/index`
- `pages/profile/index`

非 Tab 页：
- `pages/course-detail/index`
- `pages/course-edit/index`
- `pages/schedule-edit/index`
- `pages/profile-edit/index`
- `pages/theme-settings/index`
- `pages/reward-edit/index`
- `pages/credit-rule/index`
- `pages/stats/index`

## 目录结构

```text
weiyukebiao/
├── cloudfunctions/
│   └── quickstartFunctions/
├── miniprogram/
│   ├── pages/
│   ├── utils/
│   ├── app.js
│   ├── app.json
│   └── app.wxss
├── project.config.json
├── project.private.config.json
└── README.md
```

关键目录说明：
- `miniprogram/pages`：页面代码
- `miniprogram/utils`：主题、登录、学习规则等公共逻辑
- `cloudfunctions/quickstartFunctions`：当前使用的云函数

## 数据库设计

当前已使用的集合：

### `users`
用户资料表。

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
个人课表排期，按 `openid` 隔离。

核心字段：
- `openid`
- `courseId`
- `courseName`
- `weekday`
- `weekdayLabel`
- `startTime`
- `endTime`
- `note`
- `status`

### `checkins`
个人打卡、学习记录和状态记录，按 `openid` 隔离。

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
个人学习规则，按 `openid` 隔离。

核心字段：
- `openid`
- `completionCredits`
- `deepStudyThreshold`
- `deepStudyBonus`
- `missedPenalty`
- `restMonthlyLimit`
- `manualAdjustment`

### `rewards`
个人主奖励配置，按 `openid` 隔离。

核心字段：
- `openid`
- `title`
- `targetCredits`
- `description`
- `manualAdjustment`

### `materials`
当前集合已创建，但这版尚未单独启用独立资料表逻辑。

## 登录与数据隔离

当前方案：
- 小程序启动时调用云函数 `quickstartFunctions`
- 获取当前微信用户 `openid`
- 在 `users` 集合自动建档
- 个人数据按 `openid` 过滤

当前保持共享的数据：
- `courses`

当前按用户隔离的数据：
- `users`
- `user_course_plans`
- `checkins`
- `credit_rules`
- `rewards`

## 主题系统

当前已支持 10 套配色：
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

主题切换入口：
- `我的 -> 界面配色`

## 本地开发

### 1. 打开项目

在微信开发者工具中打开：

```text
/Users/shawn/Documents/ws_study/21_wechatapp/weiyukebiao
```

### 2. 云环境

当前项目使用：

```text
cloud1-1g2x48ece3357f4f
```

该环境已经配置在：
- `miniprogram/app.js`

### 3. 云函数

当前云函数：
- `quickstartFunctions`

如果修改了云函数代码，需要重新部署。

推荐部署方式：
- 右键 `cloudfunctions/quickstartFunctions`
- 选择“创建并部署：云端安装依赖（不上传 node_modules）”

如果部署时报“请选择云环境”：
- 先在 `cloudfunctions` 目录上右键
- 选择当前环境为 `cloud1`

## 运行与验证

建议按这个顺序验证：

1. 录入课程
2. 查看共享课程库
3. 从课程详情添加个人计划
4. 查看个人课表
5. 上课打卡 / 下课打卡
6. 填写学习记录
7. 查看首页、统计、奖励是否同步变化
8. 切换不同微信号，确认个人数据不串

## 上传、体验版、正式版

### 本地代码和线上代码的关系

本地目录只是源码，不是线上运行环境。

正式运行时：
- 页面代码发布到微信小程序平台
- 数据库和云函数运行在微信云开发环境

### 体验版

当前项目已经支持：
- 上传开发版本
- 设置体验版
- 生成体验版二维码

适合：
- 自己测试
- 小范围内测

### 正式版

流程：
1. 本地开发
2. 上传代码
3. 提交审核
4. 审核通过
5. 发布

## 当前已知边界

这版属于第一阶段可用版本，已经能跑通主流程，但还没有做完所有长期能力。

当前未做或未完全做的部分：
- 真正的课程资料独立表
- 文件上传到云存储
- 请假审批 / 补课机制
- 更细的出勤规则
- 更完善的权限规则收紧
- 更完整的异常处理和空状态统一

## 建议的后续迭代

建议优先级：

1. 稳定性和细节收尾
- 继续处理测试记录中的问题
- 统一文案
- 统一空状态

2. 资料管理增强
- 上传文件
- 图片/PDF/链接分类

3. 规则和统计增强
- 更完整的学习规则
- 更细的月度/周度统计

4. 提审和上线完善
- 数据权限规则收紧
- 内容合规和隐私说明

## 参考文档

- [微信云开发基础文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [微信小程序发布上线文档](https://developers.weixin.qq.com/miniprogram/dev/framework/quickstart/release.html)
