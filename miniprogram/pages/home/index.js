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
    this.loadPageData();
  },

  async loadPageData() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const [rewardDoc, creditRule, plans, allCheckins] = await Promise.all([
        ensureSingleDoc("rewards", DEFAULT_REWARD, openid),
        ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid),
        fetchAllDocs("user_course_plans", {
          where: {
            openid,
            status: "active",
          },
          orderBy: {
            field: "startTime",
            direction: "asc",
          },
          fields: {
            _id: true,
            courseName: true,
            startTime: true,
            endTime: true,
            weekday: true,
            status: true,
            startDate: true,
            endDate: true,
          },
          pageSize: 100,
        }),
        fetchAllDocs("checkins", {
          where: {
            openid,
          },
          orderBy: {
            field: "updatedAt",
            direction: "desc",
          },
          fields: {
            _id: true,
            planId: true,
            courseName: true,
            dateKey: true,
            status: true,
            studyNote: true,
            earnedCredits: true,
            finishedAt: true,
            updatedAt: true,
          },
          pageSize: 100,
        }),
      ]);

      const now = new Date();
      const todayDateKey = getDateKey(now);
      const weekday = WEEKDAY_MAP[now.getDay()];
      const weekStart = getWeekStart(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekDateKeys = Array.from({ length: 7 }, (_, index) => {
        const current = new Date(weekStart);
        current.setDate(weekStart.getDate() + index);
        return getDateKey(current);
      });
      const doneCheckins = allCheckins.filter((item) => item.status === "done");
      const totalCredits = sumCreditLedger(allCheckins, creditRule);
      const monthGain = allCheckins
        .filter((item) => {
          const anchorAt = item.finishedAt ? new Date(item.finishedAt) : item.updatedAt ? new Date(item.updatedAt) : null;
          return (
            anchorAt &&
            anchorAt.getFullYear() === now.getFullYear() &&
            anchorAt.getMonth() === now.getMonth()
          );
        })
        .reduce((sum, item) => sum + Number(item.earnedCredits || 0), 0);
      const uniqueDaySet = new Set(doneCheckins.map((item) => item.dateKey).filter(Boolean));
      let streakDays = 0;
      let cursor = new Date(now);
      while (true) {
        const dateKey = getDateKey(cursor);
        if (uniqueDaySet.has(dateKey)) {
          streakDays += 1;
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }

      const todayCheckinMap = new Map(
        allCheckins
          .filter((item) => item.dateKey === todayDateKey && item.planId)
          .map((item) => [item.planId, item])
      );
      const todayPlans = plans
        .filter((item) => item.weekday === weekday && doesPlanOccurOnDate(item, todayDateKey))
        .map((item) => {
          const checkin = todayCheckinMap.get(item._id);

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
      const nextPlan =
        todayPlans
          .filter((item) => item.status === "待开始" || item.status === "进行中")
          .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] || null;

      const weekCheckins = allCheckins.filter((item) => weekDateKeys.includes(item.dateKey));
      const weekTotal = countPlannedSessions(plans, weekStart, weekEnd);
      const recentNotes = doneCheckins
        .filter((item) => item.studyNote)
        .slice(0, 3)
        .map((item) => `${item.courseName || "未命名课程"}：${item.studyNote}`);
      const progress = calcRewardProgress(totalCredits, rewardDoc);
      this.setData({
        progressPercent: progress.progressPercent,
        totalCredits,
        streakDays,
        todayPlans,
        nextPlan,
        recentNotes: recentNotes.length ? recentNotes : ["完成打卡后，在这里沉淀每节课的学习记录。"],
        weekSummary: {
          total: weekTotal,
          done: weekCheckins.filter((item) => item.status === "done").length,
          pending: Math.max(
            weekTotal - weekCheckins.filter((item) => ["done", "leave", "rest", "missed"].includes(item.status)).length,
            0
          ),
          special: weekCheckins.filter((item) => ["leave", "rest", "missed"].includes(item.status)).length,
        },
        reward: {
          title: rewardDoc.title,
          currentCredits: progress.currentCredits,
          targetCredits: progress.targetCredits,
          completedCount: doneCheckins.length,
          monthGain,
        },
      });
    } catch (error) {
      console.error("读取首页数据失败", error);
      this.setData({
        progressPercent: 0,
        totalCredits: 0,
        streakDays: 0,
        reward: {
          title: DEFAULT_REWARD.title,
          currentCredits: 0,
          targetCredits: DEFAULT_REWARD.targetCredits,
          completedCount: 0,
          monthGain: 0,
        },
        todayPlans: [],
        nextPlan: null,
        recentNotes: ["完成打卡后，在这里沉淀每节课的学习记录。"],
        weekSummary: {
          total: 0,
          done: 0,
          pending: 0,
          special: 0,
        },
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
