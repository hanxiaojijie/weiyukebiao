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
const { countPlannedSessions } = require("../../utils/schedule");

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

Page({
  data: {
    themeKey: "strawberry",
    stats: {
      monthHours: "0.0",
      attendanceRate: 0,
      totalCredits: 0,
      rewardProgress: 0,
      doneCount: 0,
      leaveCount: 0,
      restCount: 0,
      missedCount: 0,
    },
  },

  async onShow() {
    applyTheme(this);
    await this.loadStats();
  },

  async loadStats() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const monthKey = getMonthKey();
      const [plans, allCheckins, rewardDoc, creditRule] = await Promise.all([
        fetchAllDocs("user_course_plans", {
          where: { openid, status: "active" },
          fields: {
            weekday: true,
            startDate: true,
            endDate: true,
          },
          pageSize: 100,
        }),
        fetchAllDocs("checkins", {
          where: { openid },
          fields: {
            status: true,
            dateKey: true,
            actualMinutes: true,
            plannedMinutes: true,
            earnedCredits: true,
          },
          pageSize: 100,
        }),
        ensureSingleDoc("rewards", DEFAULT_REWARD, openid),
        ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid),
      ]);

      const doneCheckins = allCheckins.filter((item) => item.status === "done");
      const monthCheckins = allCheckins.filter((item) => (item.dateKey || "").startsWith(monthKey));
      const monthMinutes = monthCheckins
        .filter((item) => item.status === "done")
        .reduce(
        (sum, item) => sum + Number(item.actualMinutes || item.plannedMinutes || 0),
        0
      );
      const totalCredits = sumCreditLedger(allCheckins, creditRule);
      const { start: monthStart } = getMonthRange();
      const today = new Date();
      const plannedCourseCount = Math.max(countPlannedSessions(plans, monthStart, today), 1);
      const attendedCount = monthCheckins.filter((item) => item.status === "done" || item.status === "leave").length;
      const attendanceRate = Math.min(
        Math.round((attendedCount / plannedCourseCount) * 100),
        100
      );
      const rewardProgress = calcRewardProgress(totalCredits, rewardDoc).progressPercent;
      const doneCount = monthCheckins.filter((item) => item.status === "done").length;
      const leaveCount = monthCheckins.filter((item) => item.status === "leave").length;
      const restCount = monthCheckins.filter((item) => item.status === "rest").length;
      const missedCount = monthCheckins.filter((item) => item.status === "missed").length;

      this.setData({
        stats: {
          monthHours: (monthMinutes / 60).toFixed(1),
          attendanceRate,
          totalCredits,
          rewardProgress,
          doneCount,
          leaveCount,
          restCount,
          missedCount,
        },
      });
    } catch (error) {
      console.error("读取统计失败", error);
    }
  },
});
