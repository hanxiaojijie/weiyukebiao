const { applyTheme } = require("../../utils/theme");
const { ensureLogin } = require("../../utils/auth");
const {
  calculateEstimatedEndDate,
  getDateKey,
  getPlanStartDateKey,
  minutesBetweenTimes,
} = require("../../utils/schedule");

const db = wx.cloud.database();

const weekdayOptions = [
  { key: "mon", label: "周一" },
  { key: "tue", label: "周二" },
  { key: "wed", label: "周三" },
  { key: "thu", label: "周四" },
  { key: "fri", label: "周五" },
  { key: "sat", label: "周六" },
  { key: "sun", label: "周日" },
];

function getInitialForm() {
  return {
    courseId: "",
    weekdays: [],
    startDate: getDateKey(new Date()),
    endDate: "",
    startTime: "18:00",
    endTime: "19:00",
    totalHours: "",
    note: "",
  };
}

function isTimeOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

Page({
  data: {
    themeKey: "strawberry",
    mode: "create",
    planId: "",
    originalCourseId: "",
    courses: [],
    weekdayOptions,
    form: getInitialForm(),
    selectedCourseName: "请选择一门已录入课程",
    selectedWeekdayLabel: "请选择上课星期",
    loadingCourses: false,
    saving: false,
    activePlanCount: 0,
    maxActiveCourses: 3,
    existingCourseIds: [],
    existingCourseUsage: {},
    restMonthlyLimit: 4,
    pageTitle: "编排课表",
    pageDesc: "先定开始日期和每周节奏，再按课程总时长估算结束日期，把学习计划真正排成一段周期。",
    saveButtonText: "保存到课表",
  },

  onLoad(options) {
    const planId = options.id || "";
    const courseId = options.courseId || "";
    const weekday = options.weekday || "";
    const startDate = options.startDate || getDateKey(new Date());
    const startTime = options.startTime || "";
    const endTime = options.endTime || "";
    if (planId) {
      this.setData({
        mode: "edit",
        planId,
        pageTitle: "编辑排期",
        pageDesc: "直接修改这条课表安排，保存后课表和打卡页会同步更新。",
        saveButtonText: "保存修改",
      });
      return;
    }

    const weekdays = weekday ? [weekday] : [];
    this.setData({
      form: {
        ...getInitialForm(),
        courseId,
        weekdays,
        startDate,
        startTime: startTime || "18:00",
        endTime: endTime ? (endTime === "24:00" ? "23:59" : endTime) : "19:00",
      },
      selectedWeekdayLabel: weekdays.length
        ? weekdayOptions.find((item) => item.key === weekday)?.label || "请选择上课星期"
        : "请选择上课星期",
    });
    this.syncWeekdayOptions(weekdays);
  },

  onShow() {
    applyTheme(this);
    this.loadRule();
    this.loadCourses();
    this.loadPlanCount();
    this.syncWeekdayOptions();
    if (this.data.mode === "edit" && this.data.planId) {
      this.loadPlanDetail();
    }
  },

  async loadRule() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const { data } = await db
        .collection("credit_rules")
        .where({ openid })
        .limit(1)
        .get();

      if (data.length) {
        this.setData({
          restMonthlyLimit: Number(data[0].restMonthlyLimit || 4),
        });
      }
    } catch (error) {
      console.error("读取学习规则失败", error);
    }
  },

  syncWeekdayOptions(weekdays = this.data.form.weekdays || []) {
    this.setData({
      weekdayOptions: weekdayOptions.map((item) => ({
        ...item,
        selected: weekdays.includes(item.key),
      })),
    });
  },

  async loadCourses() {
    this.setData({ loadingCourses: true });

    try {
      const { data } = await db
        .collection("courses")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      this.setData({
        courses: data.map((item) => ({
          id: item._id,
          name: item.name,
          colorClass: item.colorClass || "course-color-sage",
          totalDuration: item.totalDuration || "",
        })),
      }, () => {
        const selectedCourse = data.find((item) => item._id === this.data.form.courseId);
        if (!selectedCourse) {
          return;
        }

        const updates = {
          selectedCourseName: selectedCourse.name || this.data.selectedCourseName,
        };

        if (!this.data.form.totalHours) {
          updates["form.totalHours"] = selectedCourse.totalDuration || "";
        }

        this.setData(updates);
      });
    } catch (error) {
      console.error("读取课程失败", error);
      wx.showToast({
        title: "课程读取失败",
        icon: "none",
      });
    } finally {
      this.setData({ loadingCourses: false });
    }
  },

  async loadPlanCount() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const { data } = await db
        .collection("user_course_plans")
        .where({
          openid,
          status: "active",
        })
        .limit(100)
        .get();

      const courseUsage = data.reduce((accumulator, item) => {
        if (item.courseId && (!item.endDate || item.endDate >= getDateKey(new Date()))) {
          accumulator[item.courseId] = (accumulator[item.courseId] || 0) + 1;
        }
        return accumulator;
      }, {});
      const courseIds = new Set(Object.keys(courseUsage));
      this.setData({
        activePlanCount: courseIds.size,
        existingCourseIds: Array.from(courseIds),
        existingCourseUsage: courseUsage,
      });
    } catch (error) {
      console.error("读取排期数量失败", error);
    }
  },

  async loadPlanDetail() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const { data } = await db.collection("user_course_plans").doc(this.data.planId).get();
      if (data.openid && data.openid !== openid) {
        wx.showToast({
          title: "这条排期不属于你",
          icon: "none",
        });
        return;
      }
      const selectedWeekday = weekdayOptions.find((item) => item.key === data.weekday) || weekdayOptions[0];
      const selectedCourse = this.data.courses.find((item) => item.id === data.courseId);
      this.setData({
        form: {
          courseId: data.courseId || "",
          weekdays: data.weekday ? [data.weekday] : [],
          startDate: data.startDate || getDateKey(data.createdAt ? new Date(data.createdAt) : new Date()),
          endDate: data.endDate || "",
          startTime: data.startTime || "",
          endTime: data.endTime || "",
          totalHours: data.totalHours
            ? `${data.totalHours}`
            : data.totalMinutes
              ? `${(Number(data.totalMinutes) / 60).toFixed(1).replace(/\.0$/, "")}`
              : selectedCourse?.totalDuration || "",
          note: data.note || "",
        },
        originalCourseId: data.courseId || "",
        selectedCourseName: data.courseName || "请选择一门已录入课程",
        selectedWeekdayLabel: selectedWeekday.label,
      });
      this.syncWeekdayOptions(data.weekday ? [data.weekday] : []);
    } catch (error) {
      console.error("读取排期详情失败", error);
      wx.showToast({
        title: "排期读取失败",
        icon: "none",
      });
    }
  },

  onCourseChange(e) {
    const index = Number(e.detail.value);
    const selectedCourse = this.data.courses[index];
    if (!selectedCourse) {
      return;
    }

    this.setData({
      "form.courseId": selectedCourse.id,
      selectedCourseName: selectedCourse.name,
      "form.totalHours": selectedCourse.totalDuration || this.data.form.totalHours,
    });
  },

  onToggleWeekday(e) {
    const { key } = e.currentTarget.dataset;
    const currentWeekdays = this.data.form.weekdays || [];

    let nextWeekdays;
    if (currentWeekdays.includes(key)) {
      nextWeekdays = currentWeekdays.filter((item) => item !== key);
    } else {
      nextWeekdays = [...currentWeekdays, key];
    }

    const orderedWeekdays = weekdayOptions
      .map((item) => item.key)
      .filter((item) => nextWeekdays.includes(item));

    this.setData({
      "form.weekdays": orderedWeekdays,
      selectedWeekdayLabel: orderedWeekdays.length
        ? weekdayOptions
            .filter((item) => orderedWeekdays.includes(item.key))
            .map((item) => item.label)
            .join("、")
        : "请选择上课星期",
    });
    this.syncWeekdayOptions(orderedWeekdays);
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  onDateChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  onCalculateEndDate() {
    const { weekdays, startDate, startTime, endTime, totalHours } = this.data.form;
    const endDate = calculateEstimatedEndDate({
      startDate,
      weekdays,
      startTime,
      endTime,
      totalHours,
      restMonthlyLimit: this.data.restMonthlyLimit,
    });

    if (!endDate) {
      wx.showToast({
        title: "请先补完整开始日期、星期、时间和总时长",
        icon: "none",
      });
      return;
    }

    this.setData({
      "form.endDate": endDate,
    });
    wx.showToast({
      title: "结束日期已计算",
      icon: "success",
    });
  },

  validateForm() {
    const { courseId, startDate, endDate, startTime, endTime, weekdays, totalHours } = this.data.form;

    if (!courseId) {
      return "请先选择课程";
    }

    if (!startDate) {
      return "请先选择课程开始日期";
    }

    if (!weekdays.length) {
      return "请先选择上课星期";
    }

    if (!startTime.trim()) {
      return "请先选择开始时间";
    }

    if (!endTime.trim()) {
      return "请先选择结束时间";
    }

    if (startTime >= endTime) {
      return "结束时间需要晚于开始时间";
    }

    if (!`${totalHours}`.trim() || Number(totalHours) <= 0) {
      return "请先填写课程总时长";
    }

    if (!endDate) {
      return "请先计算或填写课程结束日期";
    }

    if (endDate < startDate) {
      return "结束日期不能早于开始日期";
    }

    const selectedCourseExists = this.data.existingCourseIds.includes(courseId);
    const originalCourseUsage = Number(this.data.existingCourseUsage?.[this.data.originalCourseId] || 0);
    const changingToNewDistinctCourse =
      this.data.mode === "edit" &&
      this.data.originalCourseId &&
      this.data.originalCourseId !== courseId &&
      this.data.activePlanCount >= this.data.maxActiveCourses &&
      !selectedCourseExists &&
      originalCourseUsage > 1;

    if (
      (this.data.mode !== "edit" &&
        this.data.activePlanCount >= this.data.maxActiveCourses &&
        !selectedCourseExists) ||
      changingToNewDistinctCourse
    ) {
      return "当前最多只能同时编排 3 门课程";
    }

    return "";
  },

  async onSavePlan() {
    const errorMessage = this.validateForm();
    if (errorMessage) {
      wx.showToast({
        title: errorMessage,
        icon: "none",
      });
      return;
    }

    const openid = await ensureLogin();
    if (!openid) {
      wx.showToast({
        title: "登录初始化失败",
        icon: "none",
      });
      return;
    }

    const { form, courses } = this.data;
    const selectedCourse = courses.find((item) => item.id === form.courseId);

    this.setData({ saving: true });

    try {
      const { data: existingPlans } = await db
        .collection("user_course_plans")
        .where({
          openid,
          status: "active",
        })
        .limit(100)
        .get();

      const conflictingPlan = existingPlans.find((item) => {
        if (this.data.mode === "edit" && item._id === this.data.planId) {
          return false;
        }

        return (
          form.weekdays.includes(item.weekday) &&
          !(
            (item.endDate && item.endDate < form.startDate) ||
            (form.endDate && getPlanStartDateKey(item) && getPlanStartDateKey(item) > form.endDate)
          ) &&
          isTimeOverlap(form.startTime.trim(), form.endTime.trim(), item.startTime, item.endTime)
        );
      });

      if (conflictingPlan) {
        wx.showToast({
          title: `${conflictingPlan.weekdayLabel} ${conflictingPlan.startTime}-${conflictingPlan.endTime} 已有课程`,
          icon: "none",
        });
        return;
      }

      const basePayload = {
        openid,
        courseId: form.courseId,
        courseName: selectedCourse ? selectedCourse.name : "未命名课程",
        colorClass: selectedCourse ? selectedCourse.colorClass : "course-color-sage",
        startDate: form.startDate,
        endDate: form.endDate,
        startTime: form.startTime.trim(),
        endTime: form.endTime.trim(),
        sessionMinutes: minutesBetweenTimes(form.startTime.trim(), form.endTime.trim()),
        totalHours: Number(form.totalHours),
        totalMinutes: Math.round(Number(form.totalHours) * 60),
        restMonthlyLimit: this.data.restMonthlyLimit,
        note: form.note.trim(),
        status: "active",
        updatedAt: new Date(),
      };

      if (this.data.mode === "edit" && this.data.planId) {
        const weekdayKey = form.weekdays[0];
        const selectedWeekday = weekdayOptions.find((item) => item.key === weekdayKey);
        await db.collection("user_course_plans").doc(this.data.planId).update({
          data: {
            ...basePayload,
            weekday: weekdayKey,
            weekdayLabel: selectedWeekday ? selectedWeekday.label : "周一",
          },
        });
      } else {
        await Promise.all(
          form.weekdays.map((weekdayKey) => {
            const selectedWeekday = weekdayOptions.find((item) => item.key === weekdayKey);
            return db.collection("user_course_plans").add({
              data: {
                ...basePayload,
                weekday: weekdayKey,
                weekdayLabel: selectedWeekday ? selectedWeekday.label : "周一",
                createdAt: new Date(),
              },
            });
          })
        );
      }

      wx.showToast({
        title: this.data.mode === "edit" ? "排期已更新" : "已加入课表",
        icon: "success",
      });

      this.setData({
        form: getInitialForm(),
        selectedCourseName: "请选择一门已录入课程",
        selectedWeekdayLabel: "请选择上课星期",
      });
      this.syncWeekdayOptions([]);

      setTimeout(() => {
        wx.navigateBack({
          delta: 1,
        });
      }, 500);
    } catch (error) {
      console.error("保存排期失败", error);
      wx.showToast({
        title: "保存失败，请稍后重试",
        icon: "none",
      });
    } finally {
      this.setData({ saving: false });
    }
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
    });
  },

  onDisablePlan() {
    if (this.data.mode !== "edit" || !this.data.planId) {
      return;
    }

    wx.showModal({
      title: "停用排期",
      content: "确认停用这条排期吗？停用后会从课表中移除。",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        this.setData({ saving: true });
        try {
          const openid = await ensureLogin();
          if (!openid) {
            throw new Error("missing openid");
          }
          await db.collection("user_course_plans").doc(this.data.planId).update({
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
          setTimeout(() => {
            wx.navigateBack({
              delta: 1,
            });
          }, 350);
        } catch (error) {
          console.error("停用排期失败", error);
          wx.showToast({
            title: "停用失败",
            icon: "none",
          });
        } finally {
          this.setData({ saving: false });
        }
      },
    });
  },
});
