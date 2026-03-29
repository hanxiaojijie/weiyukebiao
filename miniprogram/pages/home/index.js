const { applyTheme } = require("../../utils/theme");
const {
  DEFAULT_CREDIT_RULE,
  DEFAULT_REWARD,
  calcRewardProgress,
  ensureSingleDoc,
  sumCreditLedger,
} = require("../../utils/learning");
const { ensureLogin } = require("../../utils/auth");
const { fetchAllDocs } = require("../../utils/database");
const { countPlannedSessions, doesPlanOccurOnDate } = require("../../utils/schedule");
const db = wx.cloud.database();
const WEEKDAY_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getWeekStart(date = new Date()) {
  const now = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now;
}

Page({
  data: {
    themeKey: "strawberry",
    reward: {
      title: DEFAULT_REWARD.title,
      currentCredits: 0,
      targetCredits: DEFAULT_REWARD.targetCredits,
      completedCount: 0,
      monthGain: 0,
    },
    progressPercent: 0,
    todayPlans: [],
    recentNotes: [],
    totalCredits: 0,
    streakDays: 0,
    weekSummary: {
      total: 0,
      done: 0,
      pending: 0,
      special: 0,
    },
    nextPlan: null,
  },

  onShow() {
    applyTheme(this);
    this.loadRewardProgress();
    this.loadWeekSummary();
    this.loadTodayPlans();
    this.loadRecentNotes();
  },

  async loadRewardProgress() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const [rewardDoc, creditRule, allCheckins] = await Promise.all([
        ensureSingleDoc("rewards", DEFAULT_REWARD, openid),
        ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid),
        fetchAllDocs("checkins", {
          where: {
            openid,
          },
          pageSize: 100,
        }),
      ]);

      const doneCheckins = allCheckins.filter((item) => item.status === "done");
      const totalCredits = sumCreditLedger(allCheckins, creditRule);
      const monthGain = allCheckins
        .filter((item) => {
          const anchorAt = item.finishedAt ? new Date(item.finishedAt) : item.updatedAt ? new Date(item.updatedAt) : null;
          const now = new Date();
          return (
            anchorAt &&
            anchorAt.getFullYear() === now.getFullYear() &&
            anchorAt.getMonth() === now.getMonth()
          );
        })
        .reduce((sum, item) => sum + Number(item.earnedCredits || 0), 0);
      const uniqueDays = [...new Set(doneCheckins.map((item) => item.dateKey))].sort();
      let streakDays = 0;
      let cursor = new Date();
      while (true) {
        const dateKey = getDateKey(cursor);
        if (uniqueDays.includes(dateKey)) {
          streakDays += 1;
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }

      const progress = calcRewardProgress(totalCredits, rewardDoc);
      this.setData({
        progressPercent: progress.progressPercent,
        totalCredits,
        streakDays,
        reward: {
          title: rewardDoc.title,
          currentCredits: progress.currentCredits,
          targetCredits: progress.targetCredits,
          completedCount: doneCheckins.length,
          monthGain,
        },
      });
    } catch (error) {
      console.error("读取奖励进度失败", error);
    }
  },

  async loadTodayPlans() {
    const now = new Date();
    const weekday = WEEKDAY_MAP[now.getDay()];
    const todayDateKey = getDateKey(now);

    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const [plans, checkins] = await Promise.all([
        fetchAllDocs("user_course_plans", {
          where: {
            openid,
            status: "active",
            weekday,
          },
          orderBy: {
            field: "startTime",
            direction: "asc",
          },
          pageSize: 100,
        }).then((items) => items.filter((item) => doesPlanOccurOnDate(item, todayDateKey))),
        fetchAllDocs("checkins", {
          where: {
            openid,
            dateKey: todayDateKey,
          },
          pageSize: 100,
        }),
      ]);

      const checkinMap = new Map(checkins.map((item) => [item.planId, item]));
      const mappedPlans = plans.map((item) => {
        const checkin = checkinMap.get(item._id);
        return {
          id: item._id,
          courseName: item.courseName || "未命名课程",
          time: `${item.startTime} - ${item.endTime}`,
          startTime: item.startTime || "00:00",
          status:
            checkin?.status === "done"
              ? "已完成"
              : checkin?.status === "in_progress"
                ? "进行中"
                : checkin?.status === "leave"
                  ? "请假"
                  : checkin?.status === "rest"
                    ? "休息"
                    : checkin?.status === "missed"
                      ? "旷课"
                      : "待开始",
        };
      });

      const done = mappedPlans.filter((item) => item.status === "已完成").length;
      const special = mappedPlans.filter((item) => ["请假", "休息", "旷课"].includes(item.status)).length;
      const pending = mappedPlans.filter((item) => ["待开始", "进行中"].includes(item.status)).length;
      const nextPlan =
        mappedPlans
          .filter((item) => item.status === "待开始" || item.status === "进行中")
          .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] || null;

      this.setData({
        todayPlans: mappedPlans,
        nextPlan,
      });
    } catch (error) {
      console.error("读取首页今日安排失败", error);
      this.setData({
        todayPlans: [],
        nextPlan: null,
      });
    }
  },

  async loadWeekSummary() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const weekStart = getWeekStart(new Date());
      const weekDateKeys = Array.from({ length: 7 }).map((_, index) => {
        const current = new Date(weekStart);
        current.setDate(weekStart.getDate() + index);
        return getDateKey(current);
      });
      const [plans, checkins] = await Promise.all([
        fetchAllDocs("user_course_plans", {
          where: {
            openid,
            status: "active",
          },
          pageSize: 100,
        }),
        fetchAllDocs("checkins", {
          where: {
            openid,
          },
          pageSize: 100,
        }),
      ]);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekCheckins = checkins.filter((item) => weekDateKeys.includes(item.dateKey));
      const done = weekCheckins.filter((item) => item.status === "done").length;
      const total = countPlannedSessions(plans, weekStart, weekEnd);
      const pending = total - weekCheckins.filter((item) => ["done", "leave", "rest", "missed"].includes(item.status)).length;
      const special = weekCheckins.filter((item) => ["leave", "rest", "missed"].includes(item.status)).length;

      this.setData({
        weekSummary: {
          total,
          done,
          pending: Math.max(pending, 0),
          special,
        },
      });
    } catch (error) {
      console.error("读取本周进度失败", error);
    }
  },

  async loadRecentNotes() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const data = await fetchAllDocs("checkins", {
        where: {
          openid,
          status: "done",
        },
        orderBy: {
          field: "updatedAt",
          direction: "desc",
        },
        pageSize: 100,
      });

      const recentNotes = data
        .filter((item) => item.studyNote)
        .slice(0, 3)
        .map((item) => `${item.courseName || "未命名课程"}：${item.studyNote}`);

      this.setData({
        recentNotes: recentNotes.length ? recentNotes : ["完成打卡后，在这里沉淀每节课的学习记录。"],
      });
    } catch (error) {
      console.error("读取最近学习记录失败", error);
      this.setData({
        recentNotes: ["完成打卡后，在这里沉淀每节课的学习记录。"],
      });
    }
  },

  goStats() {
    wx.navigateTo({
      url: "/pages/stats/index",
    });
  },

  goCheckin() {
    wx.switchTab({
      url: "/pages/checkin/index",
    });
  },

  goReward() {
    wx.navigateTo({
      url: "/pages/reward-edit/index",
    });
  },
});
