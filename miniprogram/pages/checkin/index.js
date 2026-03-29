const { applyTheme } = require("../../utils/theme");
const {
  DEFAULT_CREDIT_RULE,
  calcEarnedCredits,
  calcStatusCredits,
  ensureSingleDoc,
} = require("../../utils/learning");
const { ensureLogin } = require("../../utils/auth");
const { fetchAllDocs } = require("../../utils/database");
const { doesPlanOccurOnDate } = require("../../utils/schedule");

const db = wx.cloud.database();

const WEEKDAY_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function minutesBetween(startTime, endTime) {
  if (!startTime || !endTime) {
    return 0;
  }

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  return Math.max(end - start, 0);
}

function parseTimeToMinutes(timeText = "") {
  const [hourText, minuteText] = timeText.split(":");
  return Number(hourText || 0) * 60 + Number(minuteText || 0);
}

function calcActualMinutes(startedAt, finishedAt, fallbackMinutes = 0) {
  if (!startedAt || !finishedAt) {
    return Number(fallbackMinutes || 0);
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!start || !end || end <= start) {
    return Number(fallbackMinutes || 0);
  }

  return Math.max(Math.round((end - start) / 60000), 1);
}

function mapPlanToSession(plan) {
  const minutes = minutesBetween(plan.startTime, plan.endTime);
  return {
    planId: plan._id,
    courseId: plan.courseId || "",
    course: plan.courseName || "未命名课程",
    time: `${plan.startTime}-${plan.endTime}`,
    startTime: plan.startTime,
    endTime: plan.endTime,
    minutes,
    stage: "待开始",
    note: plan.note || "",
    checkinId: "",
    startedAt: "",
    finishedAt: "",
    actualMinutes: minutes,
    creditHint: "",
  };
}

function getStageLabel(status) {
  switch (status) {
    case "done":
      return "已完成";
    case "in_progress":
      return "进行中";
    case "leave":
      return "已请假";
    case "rest":
      return "已休息";
    case "missed":
      return "已旷课";
    default:
      return "待开始";
  }
}

function getStatusNote(item, sessionNote) {
  switch (item.status) {
    case "done":
      return item.studyNote ? "本次课程已完成，学习记录已保存。" : "本次课程已完成，可继续补充学习记录。";
    case "in_progress":
      return "课程进行中，结束后记得完成打卡。";
    case "leave":
      return item.leaveReason ? `这节课已请假：${item.leaveReason}` : "这节课已记为请假，本次不计学分。";
    case "rest":
      return "这节课已记为休息，本次不计学分。";
    case "missed":
      return `这节课已记为旷课，本次学分已扣减 ${Math.abs(Number(item.earnedCredits || 0))}。`;
    default:
      return sessionNote;
  }
}

function getRecentItem(item) {
  const statusMap = {
    done: "已完成",
    in_progress: "进行中",
    leave: "请假",
    rest: "休息",
    missed: "旷课",
  };

  let note = "待开始";
  if (item.status === "done") {
    note = item.studyNote
      ? `${item.actualMinutes || item.plannedMinutes || 0} 分钟 · ${item.studyNote}`
      : `完成 ${item.actualMinutes || item.plannedMinutes || 0} 分钟`;
  } else if (item.status === "in_progress") {
    note = "课程进行中";
  } else if (item.status === "leave") {
    note = item.leaveReason ? `已请假：${item.leaveReason}` : "已请假，本次不计学分";
  } else if (item.status === "rest") {
    note = "已休息，本次不计学分";
  } else if (item.status === "missed") {
    note = `已旷课，扣减 ${Math.abs(Number(item.earnedCredits || 0))} 学分`;
  }

  return {
    id: item._id,
    course: item.courseName || "未命名课程",
    note,
    score: statusMap[item.status] || "待开始",
  };
}

function pickActiveSession(sessions = []) {
  if (!sessions.length) {
    return null;
  }

  const inProgress = sessions.find((item) => item.stage === "进行中");
  if (inProgress) {
    return inProgress;
  }

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const pendingSessions = sessions.filter((item) => item.stage === "待开始");
  const upcomingSessions = pendingSessions
    .filter((item) => parseTimeToMinutes(item.startTime) >= nowMinutes)
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  if (upcomingSessions.length) {
    return upcomingSessions[0];
  }

  if (pendingSessions.length) {
    return pendingSessions.sort(
      (a, b) => Math.abs(parseTimeToMinutes(a.startTime) - nowMinutes) - Math.abs(parseTimeToMinutes(b.startTime) - nowMinutes)
    )[0];
  }

  return sessions[0];
}

Page({
  data: {
    themeKey: "strawberry",
    activeSession: null,
    pendingList: [],
    recentList: [],
    todayDateKey: "",
    loadingPlans: false,
    actionLoading: false,
    noteSaving: false,
    studyNote: "",
    leaveReason: "",
    actualMinutesInput: "",
  },

  onShow() {
    applyTheme(this);
    this.loadTodayPlans();
    this.loadRecentCheckins();
  },

  async loadTodayPlans() {
    this.setData({
      loadingPlans: true,
    });

    const now = new Date();
    const weekday = WEEKDAY_MAP[now.getDay()];
    const todayDateKey = getDateKey(now);

    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const data = await fetchAllDocs("user_course_plans", {
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
      });

      const sessions = data.filter((item) => doesPlanOccurOnDate(item, todayDateKey)).map(mapPlanToSession);
      await this.mergeTodayCheckins(sessions, todayDateKey);
    } catch (error) {
      console.error("读取今日排期失败", error);
      wx.showToast({
        title: "今日课表读取失败",
        icon: "none",
      });
      this.setData({
        loadingPlans: false,
      });
    }
  },

  async mergeTodayCheckins(sessions, todayDateKey) {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const data = await fetchAllDocs("checkins", {
        where: {
          openid,
          dateKey: todayDateKey,
        },
        pageSize: 100,
      });

      const checkinMap = new Map(data.map((item) => [item.planId, item]));
      const mergedSessions = sessions.map((session) => {
        const existing = checkinMap.get(session.planId);
        if (!existing) {
          return session;
        }

        return {
          ...session,
          stage: getStageLabel(existing.status),
          note: getStatusNote(existing, session.note),
          checkinId: existing._id,
          studyNote: existing.studyNote || "",
          leaveReason: existing.leaveReason || "",
          startedAt: existing.startedAt || "",
          finishedAt: existing.finishedAt || "",
          actualMinutes:
            Number(existing.actualMinutes || 0) ||
            calcActualMinutes(existing.startedAt, existing.finishedAt, session.minutes),
          earnedCredits: Number(existing.earnedCredits || 0),
        };
      });
      const nextActiveSession = pickActiveSession(mergedSessions);

      this.setData({
        todayDateKey,
        pendingList: mergedSessions,
        activeSession: nextActiveSession,
        studyNote: nextActiveSession?.studyNote || "",
        leaveReason: nextActiveSession?.leaveReason || "",
        actualMinutesInput: nextActiveSession ? `${nextActiveSession.actualMinutes || nextActiveSession.minutes || 0}` : "",
        loadingPlans: false,
      });
    } catch (error) {
      console.error("读取今日打卡记录失败", error);
      this.setData({
        todayDateKey,
        pendingList: sessions,
        activeSession: pickActiveSession(sessions),
        studyNote: pickActiveSession(sessions)?.studyNote || "",
        leaveReason: pickActiveSession(sessions)?.leaveReason || "",
        actualMinutesInput: pickActiveSession(sessions) ? `${pickActiveSession(sessions).actualMinutes || pickActiveSession(sessions).minutes || 0}` : "",
        loadingPlans: false,
      });
    }
  },

  async loadRecentCheckins() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const data = await fetchAllDocs("checkins", {
        where: {
          openid,
        },
        orderBy: {
          field: "updatedAt",
          direction: "desc",
        },
        pageSize: 100,
      });

      this.setData({
        recentList: data.slice(0, 10).map(getRecentItem),
      });
    } catch (error) {
      console.error("读取最近打卡失败", error);
    }
  },

  goRule() {
    wx.navigateTo({
      url: "/pages/credit-rule/index",
    });
  },

  onSelectSession(e) {
    const { planId } = e.currentTarget.dataset;
    const activeSession = this.data.pendingList.find((item) => item.planId === planId) || null;
    this.setData({
      activeSession,
      studyNote: activeSession?.studyNote || "",
      leaveReason: activeSession?.leaveReason || "",
      actualMinutesInput: activeSession ? `${activeSession.actualMinutes || activeSession.minutes || 0}` : "",
    });
  },

  onStudyNoteInput(e) {
    this.setData({
      studyNote: e.detail.value,
    });
  },

  onLeaveReasonInput(e) {
    this.setData({
      leaveReason: e.detail.value,
    });
  },

  onActualMinutesInput(e) {
    this.setData({
      actualMinutesInput: e.detail.value,
    });
  },

  async onStartSession() {
    const { activeSession, todayDateKey } = this.data;
    if (!activeSession) {
      return;
    }

    if (activeSession.stage === "已完成") {
      wx.showToast({
        title: "这节课已经完成",
        icon: "none",
      });
      return;
    }

    if (activeSession.stage !== "待开始") {
      wx.showToast({
        title: "当前状态不能上课打卡",
        icon: "none",
      });
      return;
    }

    this.setData({ actionLoading: true });

    try {
      const openid = await ensureLogin();
      if (!openid) {
        throw new Error("missing openid");
      }

      if (activeSession.checkinId) {
        await db.collection("checkins").doc(activeSession.checkinId).update({
          data: {
            status: "in_progress",
            startedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } else {
        const result = await db.collection("checkins").add({
          data: {
            openid,
            planId: activeSession.planId,
            courseId: activeSession.courseId,
            courseName: activeSession.course,
            dateKey: todayDateKey,
            status: "in_progress",
            plannedMinutes: activeSession.minutes,
            startTime: activeSession.startTime,
            endTime: activeSession.endTime,
            startedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        activeSession.checkinId = result._id;
      }

      const nextSession = {
        ...activeSession,
        stage: "进行中",
        note: "课程进行中，结束后记得完成打卡并补一句学习记录。",
        studyNote: this.data.studyNote,
        startedAt: new Date(),
      };

      this.updateSessionInList(nextSession);
      wx.showToast({
        title: "已开始打卡",
        icon: "success",
      });
      this.loadRecentCheckins();
    } catch (error) {
      console.error("开始打卡失败", error);
      wx.showToast({
        title: "开始打卡失败",
        icon: "none",
      });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  async onFinishSession() {
    const { activeSession, todayDateKey } = this.data;
    if (!activeSession) {
      return;
    }

    if (activeSession.stage !== "进行中") {
      wx.showToast({
        title: "请先上课打卡",
        icon: "none",
      });
      return;
    }

    this.setData({ actionLoading: true });

    try {
      const finishedAt = new Date();
      const measuredMinutes = calcActualMinutes(
        activeSession.startedAt,
        finishedAt,
        activeSession.minutes
      );
      const manualMinutes = Number(this.data.actualMinutesInput || 0);
      const actualMinutes = Math.max(manualMinutes || measuredMinutes, 1);
      const studyNote = this.data.studyNote.trim();
      const openid = await ensureLogin();
      if (!openid) {
        throw new Error("missing openid");
      }
      const creditRule = await ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid);
      const { earnedCredits, deepStudyThreshold, deepStudyBonus } = calcEarnedCredits(
        creditRule,
        actualMinutes
      );

      if (activeSession.checkinId) {
        await db.collection("checkins").doc(activeSession.checkinId).update({
          data: {
            status: "done",
            actualMinutes,
            studyNote,
            earnedCredits,
            finishedAt,
            updatedAt: new Date(),
          },
        });
      } else {
        const result = await db.collection("checkins").add({
          data: {
            openid,
            planId: activeSession.planId,
            courseId: activeSession.courseId,
            courseName: activeSession.course,
            dateKey: todayDateKey,
            status: "done",
            plannedMinutes: activeSession.minutes,
            actualMinutes,
            studyNote,
            earnedCredits,
            startTime: activeSession.startTime,
            endTime: activeSession.endTime,
            startedAt: activeSession.startedAt || new Date(),
            finishedAt,
            updatedAt: new Date(),
          },
        });
        activeSession.checkinId = result._id;
      }

      const nextSession = {
        ...activeSession,
        stage: "已完成",
        note: studyNote
          ? `本次课程已完成，学习记录已保存，获得 ${earnedCredits} 学分。`
          : `本次课程已完成，获得 ${earnedCredits} 学分。`,
        studyNote,
        actualMinutes,
        earnedCredits,
        finishedAt,
        creditHint:
          actualMinutes >= deepStudyThreshold && deepStudyBonus
            ? `含深度学习奖励 +${deepStudyBonus}`
            : "",
      };

      this.updateSessionInList(nextSession);
      wx.showToast({
        title: "已完成打卡",
        icon: "success",
      });
      this.loadRecentCheckins();
    } catch (error) {
      console.error("完成打卡失败", error);
      wx.showToast({
        title: "完成打卡失败",
        icon: "none",
      });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  async onMarkSessionStatus(e) {
      const { status } = e.currentTarget.dataset;
      const { activeSession, todayDateKey } = this.data;
    if (!activeSession || !status) {
      return;
    }

    if (activeSession.stage !== "待开始") {
      wx.showToast({
        title: "当前状态不能再设置这个按钮",
        icon: "none",
      });
      return;
    }

    this.setData({ actionLoading: true });

    try {
      const openid = await ensureLogin();
      if (!openid) {
        throw new Error("missing openid");
      }
      const creditRule = await ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid);
      if (status === "rest") {
        const monthKey = getMonthKey();
        const monthRests = await fetchAllDocs("checkins", {
          where: {
            openid,
            status: "rest",
          },
          pageSize: 100,
        });
        const restCount = monthRests.filter((item) => (item.dateKey || "").startsWith(monthKey)).length;
        if (restCount >= Number(creditRule.restMonthlyLimit || DEFAULT_CREDIT_RULE.restMonthlyLimit)) {
          throw new Error("rest limit exceeded");
        }
      }

      const leaveReason = this.data.leaveReason.trim();
      if (status === "leave" && !leaveReason) {
        wx.showToast({
          title: "请先填写请假原因",
          icon: "none",
        });
        this.setData({ actionLoading: false });
        return;
      }
      const earnedCredits = calcStatusCredits(creditRule, status);
      const updateData = {
        status,
        actualMinutes: 0,
        earnedCredits,
        studyNote: "",
        leaveReason: status === "leave" ? leaveReason : "",
        finishedAt: new Date(),
        updatedAt: new Date(),
      };

      if (activeSession.checkinId) {
        await db.collection("checkins").doc(activeSession.checkinId).update({
          data: updateData,
        });
      } else {
        const result = await db.collection("checkins").add({
          data: {
            openid,
            planId: activeSession.planId,
            courseId: activeSession.courseId,
            courseName: activeSession.course,
            dateKey: todayDateKey,
            plannedMinutes: activeSession.minutes,
            startTime: activeSession.startTime,
            endTime: activeSession.endTime,
            createdAt: new Date(),
            ...updateData,
          },
        });
        activeSession.checkinId = result._id;
      }

      const stage = getStageLabel(status);
      const nextSession = {
        ...activeSession,
        stage,
        studyNote: "",
        leaveReason: status === "leave" ? leaveReason : "",
        actualMinutes: 0,
        earnedCredits,
        note: getStatusNote({ status, earnedCredits, leaveReason }, activeSession.note),
        creditHint: "",
        startedAt: "",
        finishedAt: new Date(),
      };

      this.updateSessionInList(nextSession);
      wx.showToast({
        title: stage,
        icon: "success",
      });
      this.loadRecentCheckins();
    } catch (error) {
      console.error("设置课程状态失败", error);
      wx.showToast({
        title: error?.message === "rest limit exceeded" ? "本月休息次数已用完" : "操作失败",
        icon: "none",
      });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  async onSaveStudyNote() {
    const { activeSession } = this.data;
    if (!activeSession || !activeSession.checkinId) {
      wx.showToast({
        title: "请先开始或完成打卡",
        icon: "none",
      });
      return;
    }

    this.setData({ noteSaving: true });

    try {
      const studyNote = this.data.studyNote.trim();
      const openid = await ensureLogin();
      if (!openid) {
        throw new Error("missing openid");
      }
      const creditRule = await ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid);
      const actualMinutes =
        activeSession.stage === "已完成"
          ? Math.max(Number(this.data.actualMinutesInput || activeSession.actualMinutes || activeSession.minutes || 0), 1)
          : Number(activeSession.actualMinutes || activeSession.minutes || 0);
      const recalculatedCredits =
        activeSession.stage === "已完成"
          ? calcEarnedCredits(creditRule, actualMinutes).earnedCredits
          : Number(activeSession.earnedCredits || 0);
      const creditMeta =
        activeSession.stage === "已完成"
          ? calcEarnedCredits(creditRule, actualMinutes)
          : null;

      await db.collection("checkins").doc(activeSession.checkinId).update({
        data: {
          studyNote,
          actualMinutes,
          earnedCredits: recalculatedCredits,
          updatedAt: new Date(),
        },
      });

      const nextSession = {
        ...activeSession,
        studyNote,
        actualMinutes,
        earnedCredits: recalculatedCredits,
        note:
          activeSession.stage === "已完成"
            ? studyNote
              ? `本次课程已完成，学习记录已保存，当前计 ${recalculatedCredits} 学分。`
              : `本次课程已完成，当前计 ${recalculatedCredits} 学分。`
            : ["已请假", "已休息", "已旷课"].includes(activeSession.stage)
              ? activeSession.note
            : "课程进行中，结束后记得完成打卡。",
        creditHint:
          creditMeta && actualMinutes >= creditMeta.deepStudyThreshold && creditMeta.deepStudyBonus
            ? `含深度学习奖励 +${creditMeta.deepStudyBonus}`
            : "",
      };

      this.updateSessionInList(nextSession);
      wx.showToast({
        title: "学习记录已保存",
        icon: "success",
      });
      this.loadRecentCheckins();
    } catch (error) {
      console.error("保存学习记录失败", error);
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({ noteSaving: false });
    }
  },

  updateSessionInList(nextSession) {
    const pendingList = this.data.pendingList.map((item) =>
      item.planId === nextSession.planId ? nextSession : item
    );

    this.setData({
      pendingList,
      activeSession: nextSession,
      studyNote: nextSession.studyNote || "",
      leaveReason: nextSession.leaveReason || "",
      actualMinutesInput: `${nextSession.actualMinutes || nextSession.minutes || 0}`,
    });
  },
});
