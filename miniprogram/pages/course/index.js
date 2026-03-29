const { applyTheme } = require("../../utils/theme");
const { ensureLogin } = require("../../utils/auth");
const {
  addDays,
  doesPlanOccurOnDate,
  getDateKey,
  getPlanStartDateKey,
  getWeekdayKey,
  parseDateKey,
} = require("../../utils/schedule");

const db = wx.cloud.database();

const timeRows = [
  { key: "daytime", label: "08:00-17:00", short: "白天", compact: true },
  { key: "afterwork", label: "17:00-19:00", short: "傍晚" },
  { key: "prime", label: "19:00-21:00", short: "黄金" },
  { key: "night", label: "21:00-22:30", short: "晚间" },
  { key: "late", label: "22:30-24:00", short: "深夜" },
];

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DAYS_PER_PAGE = 4;
const INITIAL_PAGES_BEFORE = 5;
const INITIAL_PAGES_AFTER = 5;
const EXTEND_PAGES_COUNT = 4;

function formatDateLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getWeekStart(date) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return base;
}

function formatPageLabel(startDate, endDate) {
  return `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`;
}

function getStatusMeta(checkin) {
  switch (checkin?.status) {
    case "done":
      return {
        label: "已完成",
        className: "course-status-done",
      };
    case "in_progress":
      return {
        label: "进行中",
        className: "course-status-progress",
      };
    case "leave":
      return {
        label: "请假",
        className: "course-status-leave",
      };
    case "rest":
      return {
        label: "休息",
        className: "course-status-rest",
      };
    case "missed":
      return {
        label: "旷课",
        className: "course-status-missed",
      };
    default:
      return null;
  }
}

function createPageColumns(startDate, planList = [], checkinMap = new Map()) {
  const todayKey = getDateKey(new Date());
  const columns = [];

  for (let dayIndex = 0; dayIndex < DAYS_PER_PAGE; dayIndex += 1) {
    const date = addDays(startDate, dayIndex);
    const dateKey = getDateKey(date);
    const weekdayIndex = (date.getDay() + 6) % 7;

    columns.push({
      id: `day-${dateKey}`,
      dateKey,
      weekdayKey: getWeekdayKey(date),
      weekdayLabel: WEEKDAY_LABELS[weekdayIndex],
      dateLabel: formatDateLabel(date),
      isToday: dateKey === todayKey,
      isPast: dateKey < todayKey,
      slots: timeRows.map((slot) => ({
        ...slot,
        defaultStartTime: slot.key === "daytime" ? "08:00" : slot.key === "afterwork" ? "17:00" : slot.key === "prime" ? "19:00" : slot.key === "night" ? "21:00" : "22:30",
        defaultEndTime: slot.key === "daytime" ? "17:00" : slot.key === "afterwork" ? "19:00" : slot.key === "prime" ? "21:00" : slot.key === "night" ? "22:30" : "24:00",
        schedule: getScheduleForDate(planList, checkinMap, date, slot.key),
      })),
    });
  }

  return columns;
}

function buildPageRange(rangeStartDate, pageCount, planList = [], checkinMap = new Map()) {
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  const weekPages = [];
  let currentPageIndex = 0;
  let currentPageStart = new Date(rangeStartDate);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const columns = createPageColumns(currentPageStart, planList, checkinMap);
    const lastColumn = columns[columns.length - 1];

    weekPages.push({
      id: `page-${getDateKey(currentPageStart)}`,
      label: formatPageLabel(parseDateKey(columns[0].dateKey), parseDateKey(lastColumn.dateKey)),
      columns,
    });

    if (columns.some((item) => item.isToday)) {
      currentPageIndex = weekPages.length - 1;
    }

    currentPageStart = addDays(currentPageStart, DAYS_PER_PAGE);
  }

  return {
    weekPages,
    currentWeekIndex: currentPageIndex,
    rangeStartDate,
    todayRangeStartDate: addDays(currentWeekStart, INITIAL_PAGES_BEFORE * DAYS_PER_PAGE * -1),
  };
}

function getSlotKeyByTime(startTime) {
  if (!startTime) {
    return "night";
  }

  const [hourText] = startTime.split(":");
  const hour = Number(hourText);

  if (hour < 17) {
    return "daytime";
  }
  if (hour < 19) {
    return "afterwork";
  }
  if (hour < 21) {
    return "prime";
  }
  if (hour < 22.5) {
    return "night";
  }
  return "late";
}

function getScheduleForDate(planList, checkinMap, date, slotKey) {
  const weekdayKey = getWeekdayKey(date);
  const matchedPlans = planList.filter(
    (plan) => doesPlanOccurOnDate(plan, date) && plan.weekday === weekdayKey && getSlotKeyByTime(plan.startTime) === slotKey
  );

  if (!matchedPlans.length) {
    return null;
  }

  const matchedPlan = matchedPlans[0];

  const checkin = checkinMap.get(`${matchedPlan._id}|${getDateKey(date)}`);
  const statusMeta = getStatusMeta(checkin);

  return {
    planId: matchedPlan._id,
    weekday: matchedPlan.weekday,
    title: matchedPlan.courseName,
    time: `${matchedPlan.startTime}-${matchedPlan.endTime}`,
    startTime: matchedPlan.startTime,
    endTime: matchedPlan.endTime,
    colorClass: matchedPlan.colorClass || "course-color-sage",
    statusLabel: statusMeta?.label || "",
    statusClass: statusMeta?.className || "",
    earnedCredits: Number(checkin?.earnedCredits || 0),
    conflictCount: matchedPlans.length > 1 ? matchedPlans.length - 1 : 0,
  };
}

Page({
  data: {
    themeKey: "strawberry",
    keyword: "",
    activePlanCount: 3,
    maxActiveCourses: 3,
    timeRows,
    weekPages: [],
    currentWeekIndex: 0,
    currentWeekLabel: "",
    pageRangeStart: "",
    courses: [],
    loadingCourses: false,
    visibleCourses: [],
    showAllCourses: false,
    rawPlans: [],
    plans: [],
    checkins: [],
    groupedPlans: [],
    actionLoading: false,
  },

  onLoad() {
    const todayRangeStart = addDays(getWeekStart(new Date()), INITIAL_PAGES_BEFORE * DAYS_PER_PAGE * -1);
    const { weekPages, currentWeekIndex } = buildPageRange(
      todayRangeStart,
      INITIAL_PAGES_BEFORE + INITIAL_PAGES_AFTER + 1,
      []
    );
    this.setData({
      weekPages,
      currentWeekIndex,
      currentWeekLabel: weekPages[currentWeekIndex]?.label || "",
      pageRangeStart: getDateKey(todayRangeStart),
    });
  },

  onShow() {
    applyTheme(this);
    this.loadCourses();
    this.loadPlans();
  },

  async loadCourses() {
    this.setData({
      loadingCourses: true,
    });

    try {
      const { data } = await db
        .collection("courses")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const courses = data.map((item) => ({
        id: item._id,
        name: item.name || "未命名课程",
        tags: item.tags || [],
        desc: item.description || "暂无课程简介",
        category: item.category || "未分类",
        totalDuration: item.totalDuration || "-",
        colorName: item.colorName || "未设颜色",
        colorClass: item.colorClass || "course-color-sage",
      }));

      this.setData({
        courses,
        visibleCourses: this.data.showAllCourses ? courses : courses.slice(0, 10),
      });
    } catch (error) {
      console.error("读取课程失败", error);
      wx.showToast({
        title: "课程读取失败",
        icon: "none",
      });
    } finally {
      this.setData({
        loadingCourses: false,
      });
    }
  },

  async loadPlans() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const [planRes, checkinRes] = await Promise.all([
        db
          .collection("user_course_plans")
          .where({
            openid,
            status: "active",
          })
          .orderBy("createdAt", "desc")
          .limit(100)
          .get(),
        db
          .collection("checkins")
          .where({
            openid,
          })
          .limit(500)
          .get(),
      ]);

      const data = planRes.data || [];
      const checkins = checkinRes.data || [];
      const checkinMap = new Map(
        checkins
          .filter((item) => item.planId && item.dateKey)
          .map((item) => [`${item.planId}|${item.dateKey}`, item])
      );
      const todayRangeStart = addDays(getWeekStart(new Date()), INITIAL_PAGES_BEFORE * DAYS_PER_PAGE * -1);
      const { weekPages, currentWeekIndex } = buildPageRange(
        todayRangeStart,
        INITIAL_PAGES_BEFORE + INITIAL_PAGES_AFTER + 1,
        data,
        checkinMap
      );
      const todayKey = getDateKey(new Date());
      const effectivePlans = data.filter((item) => !item.endDate || item.endDate >= todayKey);
      const activeCourseIds = new Set(effectivePlans.map((item) => item.courseId).filter(Boolean));
      const groupedPlans = this.groupPlans(effectivePlans);

      this.setData({
        rawPlans: data,
        plans: data.map((item) => ({
          id: item._id,
          courseId: item.courseId || "",
          courseName: item.courseName || "未命名课程",
          weekdayLabel: item.weekdayLabel || "周一",
          startTime: item.startTime || "",
          endTime: item.endTime || "",
          note: item.note || "",
        })),
        checkins,
        groupedPlans,
        activePlanCount: activeCourseIds.size,
        weekPages,
        currentWeekIndex,
        currentWeekLabel: weekPages[currentWeekIndex]?.label || "",
        pageRangeStart: getDateKey(todayRangeStart),
      });
    } catch (error) {
      console.error("读取排期失败", error);
      wx.showToast({
        title: "课表读取失败",
        icon: "none",
      });
    }
  },

  groupPlans(planList = []) {
    const groupedMap = new Map();
    planList.forEach((item) => {
      const key = item.courseId || item.courseName;
      const current = groupedMap.get(key) || {
        id: item._id,
        courseName: item.courseName || "未命名课程",
        note: item.note || "",
        weekdayLabels: [],
        timeRanges: [],
        colorClass: item.colorClass || "course-color-sage",
        startDate: getPlanStartDateKey(item),
        endDate: item.endDate || "",
      };
      current.weekdayLabels.push(item.weekdayLabel || "周一");
      current.timeRanges.push(`${item.startTime || ""}-${item.endTime || ""}`);
      if (!current.note && item.note) {
        current.note = item.note;
      }
      groupedMap.set(key, current);
    });

    return Array.from(groupedMap.values()).map((item) => ({
      ...item,
      weekdayLabel: [...new Set(item.weekdayLabels)].join("、"),
      timeLabel: [...new Set(item.timeRanges)].join(" / "),
      dateRangeLabel: item.endDate ? `${item.startDate} 至 ${item.endDate}` : `${item.startDate} 起`,
    }));
  },

  syncVisibleCourses() {
    const visibleCourses = this.data.showAllCourses ? this.data.courses : this.data.courses.slice(0, 10);
    this.setData({
      visibleCourses,
    });
  },

  onToggleMoreCourses() {
    this.setData(
      {
        showAllCourses: !this.data.showAllCourses,
      },
      () => this.syncVisibleCourses()
    );
  },

  onJumpToday() {
    const todayRangeStart = addDays(getWeekStart(new Date()), INITIAL_PAGES_BEFORE * DAYS_PER_PAGE * -1);
    const { weekPages, currentWeekIndex } = buildPageRange(
      todayRangeStart,
      INITIAL_PAGES_BEFORE + INITIAL_PAGES_AFTER + 1,
      this.data.rawPlans,
      this.buildCheckinMap()
    );
    this.setData({
      weekPages,
      currentWeekIndex,
      currentWeekLabel: weekPages[currentWeekIndex]?.label || "",
      pageRangeStart: getDateKey(todayRangeStart),
    });
  },

  onJumpThisWeek() {
    this.onJumpToday();
  },

  onWeekChange(e) {
    const currentWeekIndex = Number(e.detail.current || 0);
    const updates = {
      currentWeekIndex,
      currentWeekLabel: this.data.weekPages[currentWeekIndex]?.label || "",
    };
    this.setData(updates, () => {
      this.extendPagesIfNeeded(currentWeekIndex);
    });
  },

  buildCheckinMap() {
    return new Map(
      (this.data.checkins || [])
        .filter((item) => item.planId && item.dateKey)
        .map((item) => [`${item.planId}|${item.dateKey}`, item])
    );
  },

  extendPagesIfNeeded(currentWeekIndex) {
    if (currentWeekIndex <= 1) {
      this.prependPages();
      return;
    }

    if (currentWeekIndex >= this.data.weekPages.length - 2) {
      this.appendPages();
    }
  },

  prependPages() {
    const rangeStartDate = parseDateKey(this.data.pageRangeStart);
    const nextRangeStartDate = addDays(rangeStartDate, DAYS_PER_PAGE * EXTEND_PAGES_COUNT * -1);
    const prependedPages = buildPageRange(
      nextRangeStartDate,
      EXTEND_PAGES_COUNT,
      this.data.rawPlans,
      this.buildCheckinMap()
    ).weekPages;

    const weekPages = [...prependedPages, ...this.data.weekPages];
    const currentWeekIndex = this.data.currentWeekIndex + prependedPages.length;
    this.setData({
      weekPages,
      currentWeekIndex,
      currentWeekLabel: weekPages[currentWeekIndex]?.label || "",
      pageRangeStart: getDateKey(nextRangeStartDate),
    });
  },

  appendPages() {
    const lastPage = this.data.weekPages[this.data.weekPages.length - 1];
    if (!lastPage) {
      return;
    }

    const lastDateKey = lastPage.columns[lastPage.columns.length - 1]?.dateKey;
    const appendStartDate = addDays(new Date(lastDateKey), 1);
    const appendedPages = buildPageRange(
      appendStartDate,
      EXTEND_PAGES_COUNT,
      this.data.rawPlans,
      this.buildCheckinMap()
    ).weekPages;

    const weekPages = [...this.data.weekPages, ...appendedPages];
    this.setData({
      weekPages,
      currentWeekLabel: weekPages[this.data.currentWeekIndex]?.label || "",
    });
  },

  onTapSlot(e) {
    const { planId, weekday, startTime, endTime, startDate } = e.currentTarget.dataset;
    if (planId) {
      wx.navigateTo({
        url: `/pages/schedule-edit/index?id=${planId}`,
      });
      return;
    }

    const query = [];
    if (weekday) {
      query.push(`weekday=${weekday}`);
    }
    if (startTime) {
      query.push(`startTime=${startTime}`);
    }
    if (endTime) {
      query.push(`endTime=${endTime}`);
    }
    if (startDate) {
      query.push(`startDate=${startDate}`);
    }

    wx.navigateTo({
      url: `/pages/schedule-edit/index${query.length ? `?${query.join("&")}` : ""}`,
    });
  },

  goCreate() {
    wx.navigateTo({
      url: "/pages/course-edit/index",
    });
  },

  goSchedule() {
    wx.navigateTo({
      url: "/pages/schedule-edit/index",
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/course-detail/index?id=${id}`,
    });
  },

  goEditPlan(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    wx.navigateTo({
      url: `/pages/schedule-edit/index?id=${id}`,
    });
  },

  onDeletePlan(e) {
    const { id, course } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    wx.showModal({
      title: "停用排期",
      content: `确认停用「${course || "这门课程"}」这条排期吗？停用后会从课表中移除。`,
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

      this.setData({ actionLoading: true });
        try {
          const openid = await ensureLogin();
          if (!openid) {
            throw new Error("missing openid");
          }
          await db.collection("user_course_plans").doc(id).update({
            data: {
              openid,
              status: "inactive",
              updatedAt: new Date(),
            },
          });
          wx.showToast({
            title: "排期已停用",
            icon: "success",
          });
          this.loadPlans();
        } catch (error) {
          console.error("停用排期失败", error);
          wx.showToast({
            title: "操作失败",
            icon: "none",
          });
        } finally {
          this.setData({ actionLoading: false });
        }
      },
    });
  },
});
