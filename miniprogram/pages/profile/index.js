const { applyTheme } = require("../../utils/theme");
const { ensureLogin, getUserProfile } = require("../../utils/auth");
const { fetchAllDocs } = require("../../utils/database");
const { countPlannedSessions } = require("../../utils/schedule");
const db = wx.cloud.database();

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

Page({
  data: {
    themeKey: "strawberry",
    profile: {
      nickname: "学习者",
      intro: "给迷茫的职场人，一条稳定提升的成长通道。",
    },
    profileStats: {
      weekHours: "0.0",
      monthAttendance: 0,
    },
    panels: [
      {
        title: "个人信息",
        desc: "修改昵称和头像展示。",
        path: "/pages/profile-edit/index",
      },
      {
        title: "学习规则",
        desc: "调整学分、休息次数和旷课等规则。",
        path: "/pages/credit-rule/index",
      },
      {
        title: "我的奖励目标",
        desc: "当前只支持一个主奖励，自动计算进度。",
        path: "/pages/reward-edit/index",
      },
      {
        title: "统计中心",
        desc: "查看学习时长、出勤、学分和奖励进度。",
        path: "/pages/stats/index",
      },
      {
        title: "界面配色",
        desc: "进入二级菜单切换不同配色主题。",
        path: "/pages/theme-settings/index",
      },
    ],
  },

  onShow() {
    applyTheme(this);
    this.loadProfile();
    this.loadProfileStats();
  },

  async loadProfile() {
    const openid = await ensureLogin();
    if (!openid) {
      return;
    }

    const profile = getUserProfile();
    if (profile) {
      this.setData({
          profile: {
            nickname: profile.nickname || "学习者",
            intro: profile.intro || "给迷茫的职场人，一条稳定提升的成长通道。",
            avatarUrl: profile.avatarUrl || "",
          },
        });
      return;
    }

    try {
      const { data } = await db
        .collection("users")
        .where({
          openid,
        })
        .limit(1)
        .get();
      if (data.length) {
        this.setData({
          profile: {
            nickname: data[0].nickname || "学习者",
            intro: data[0].intro || "给迷茫的职场人，一条稳定提升的成长通道。",
            avatarUrl: data[0].avatarUrl || "",
          },
        });
      }
    } catch (error) {
      console.error("读取用户信息失败", error);
    }
  },

  async loadProfileStats() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const monthKey = getMonthKey();
      const [plans, allCheckins] = await Promise.all([
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
            finishedAt: true,
          },
          pageSize: 100,
        }),
      ]);

      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diff);
      weekStart.setHours(0, 0, 0, 0);

      const weekMinutes = allCheckins
        .filter((item) => item.status === "done")
        .filter((item) => {
          const finishedAt = item.finishedAt ? new Date(item.finishedAt) : null;
          return finishedAt && finishedAt >= weekStart;
        })
        .reduce((sum, item) => sum + Number(item.actualMinutes || item.plannedMinutes || 0), 0);

      const monthCheckins = allCheckins.filter((item) => (item.dateKey || "").startsWith(monthKey));
      const attendedCount = monthCheckins.filter((item) => item.status === "done" || item.status === "leave").length;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const plannedSessions = Math.max(countPlannedSessions(plans, monthStart, now), 1);
      const monthAttendance = Math.min(
        Math.round((attendedCount / plannedSessions) * 100),
        100
      );

      this.setData({
        profileStats: {
          weekHours: (weekMinutes / 60).toFixed(1),
          monthAttendance,
        },
      });
    } catch (error) {
      console.error("读取个人页统计失败", error);
    }
  },

  goPage(e) {
    const { path } = e.currentTarget.dataset;
    wx.navigateTo({ url: path });
  },
});
