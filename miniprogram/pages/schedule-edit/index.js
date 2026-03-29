const { applyTheme } = require("../../utils/theme");
const { ensureLogin } = require("../../utils/auth");
const {
  calculateEstimatedEndDate,
  getDateKey,
  getPlanStartDateKey,
  getPlanWeekdays,
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

function isTimeOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getWeekdayLabelSummary(weekdays = []) {
  return weekdayOptions
    .filter((item) => weekdays.includes(item.key))
    .map((item) => item.label)
    .join("、");
}

function createEmptyBlock(seed = {}) {
  const weekdays = Array.isArray(seed.weekdays) ? seed.weekdays.filter(Boolean) : [];
  return {
    id: seed.id || "",
    localKey: seed.localKey || `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    weekdays,
    weekdaySummary: weekdays.length ? getWeekdayLabelSummary(weekdays) : "请选择上课星期",
    startDate: seed.startDate || getDateKey(new Date()),
    endDate: seed.endDate || "",
    startTime: seed.startTime || "18:00",
    endTime: seed.endTime || "19:00",
    totalHours: seed.totalHours || "",
    note: seed.note || "",
  };
}

function decorateBlock(block = {}) {
  const weekdays = Array.isArray(block.weekdays) ? block.weekdays.filter(Boolean) : [];
  return {
    ...block,
    weekdays,
    weekdaySummary: weekdays.length ? getWeekdayLabelSummary(weekdays) : "请选择上课星期",
    weekdayStates: weekdayOptions.map((item) => ({
      ...item,
      selected: weekdays.includes(item.key),
    })),
  };
}

function buildBlockFromPlan(plan = {}, course = null) {
  return createEmptyBlock({
    id: plan._id || "",
    localKey: plan._id || undefined,
    weekdays: getPlanWeekdays(plan),
    startDate: plan.startDate || getPlanStartDateKey(plan) || getDateKey(new Date()),
    endDate: plan.endDate || "",
    startTime: plan.startTime || "18:00",
    endTime: plan.endTime || "19:00",
    totalHours: plan.totalHours
      ? `${plan.totalHours}`
      : plan.totalMinutes
        ? `${(Number(plan.totalMinutes) / 60).toFixed(1).replace(/\.0$/, "")}`
        : course?.totalDuration || "",
    note: plan.note || "",
  });
}

function hasWeekdayOverlap(sourceWeekdays = [], targetWeekdays = []) {
  return sourceWeekdays.some((weekday) => targetWeekdays.includes(weekday));
}

Page({
  data: {
    themeKey: "strawberry",
    mode: "create",
    courses: [],
    weekdayOptions,
    blocks: [decorateBlock(createEmptyBlock())],
    selectedCourseId: "",
    selectedCourseName: "请选择一门已录入课程",
    loadingCourses: false,
    loadingBlocks: false,
    saving: false,
    activePlanCount: 0,
    maxActiveCourses: 3,
    existingCourseIds: [],
    existingCourseUsage: {},
    restMonthlyLimit: 4,
    pageTitle: "编排课表",
    pageDesc: "按课程统一管理多个阶段排期，同一门课可追加多段不同月份的学习节奏。",
    saveButtonText: "保存课程排期",
  },

  onLoad(options) {
    this.options = options || {};
    this.prefill = {
      courseId: options.courseId || "",
      weekday: options.weekday || "",
      startDate: options.startDate || getDateKey(new Date()),
      startTime: options.startTime || "",
      endTime: options.endTime || "",
    };
    this.anchorPlanId = options.id || "";
    if (this.anchorPlanId) {
      this.setData({
        mode: "edit",
        pageTitle: "管理课程排期",
        pageDesc: "一门课的多个阶段排期都在这里统一维护，可追加、修改或移除。",
        saveButtonText: "保存全部排期",
      });
      return;
    }

    if (this.prefill.courseId) {
      this.setData({
        pageTitle: "管理课程排期",
        pageDesc: "先定这一阶段的起止日期，再继续追加下一阶段排期。",
        saveButtonText: "保存全部排期",
      });
    }
  },

  async onShow() {
    applyTheme(this);
    await this.initializePage();
  },

  async initializePage() {
    await Promise.all([this.loadRule(), this.loadCourses(), this.loadPlanCount()]);
    await this.resolveManagedCourse();
  },

  async resolveManagedCourse() {
    if (this.anchorPlanId) {
      await this.loadCourseIdByPlan(this.anchorPlanId);
      return;
    }

    if (this.prefill.courseId) {
      await this.loadCoursePlans(this.prefill.courseId, {
        preservePrefillBlock: true,
      });
      return;
    }

    this.resetBlocks();
  },

  resetBlocks() {
    this.setData({
      blocks: [decorateBlock(createEmptyBlock(this.buildPrefillSeed()))],
    });
  },

  buildPrefillSeed() {
    const weekdays = this.prefill.weekday ? [this.prefill.weekday] : [];
    return {
      weekdays,
      startDate: this.prefill.startDate || getDateKey(new Date()),
      startTime: this.prefill.startTime || "18:00",
      endTime: this.prefill.endTime ? (this.prefill.endTime === "24:00" ? "23:59" : this.prefill.endTime) : "19:00",
    };
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

  async loadCourseIdByPlan(planId) {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const { data } = await db.collection("user_course_plans").doc(planId).get();
      if (data.openid && data.openid !== openid) {
        wx.showToast({
          title: "这条排期不属于你",
          icon: "none",
        });
        return;
      }

      await this.loadCoursePlans(data.courseId || "", {
        preservePrefillBlock: false,
      });
    } catch (error) {
      console.error("读取排期详情失败", error);
      wx.showToast({
        title: "排期读取失败",
        icon: "none",
      });
    }
  },

  async loadCoursePlans(courseId, options = {}) {
    if (!courseId) {
      this.setData({
        selectedCourseId: "",
        selectedCourseName: "请选择一门已录入课程",
      });
      this.resetBlocks();
      return;
    }

    this.setData({
      loadingBlocks: true,
      selectedCourseId: courseId,
    });

    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const selectedCourse = this.data.courses.find((item) => item.id === courseId) || null;
      const { data } = await db
        .collection("user_course_plans")
        .where({
          openid,
          courseId,
          status: "active",
        })
        .orderBy("startDate", "asc")
        .limit(100)
        .get();

      const blocks = data.length
        ? data.map((item) => decorateBlock(buildBlockFromPlan(item, selectedCourse)))
        : [decorateBlock(createEmptyBlock({
            ...this.buildPrefillSeed(),
            totalHours: selectedCourse?.totalDuration || "",
          }))];

      if (options.preservePrefillBlock && !data.length && this.prefill.weekday) {
        blocks[0] = decorateBlock(createEmptyBlock({
          ...this.buildPrefillSeed(),
          totalHours: selectedCourse?.totalDuration || "",
        }));
      }

      this.setData({
        selectedCourseId: courseId,
        selectedCourseName: selectedCourse?.name || "请选择一门已录入课程",
        blocks,
        mode: "edit",
        pageTitle: "管理课程排期",
        pageDesc: "同一门课可以维护多段排期，适合按月份或阶段调整学习节奏。",
        saveButtonText: "保存全部排期",
      });
    } catch (error) {
      console.error("读取课程排期失败", error);
      wx.showToast({
        title: "排期读取失败",
        icon: "none",
      });
    } finally {
      this.setData({ loadingBlocks: false });
    }
  },

  onCourseChange(e) {
    const index = Number(e.detail.value);
    const selectedCourse = this.data.courses[index];
    if (!selectedCourse) {
      return;
    }

    this.loadCoursePlans(selectedCourse.id, {
      preservePrefillBlock: false,
    });
  },

  updateBlock(localKey, patch) {
    const blocks = this.data.blocks.map((item) => {
      if (item.localKey !== localKey) {
        return item;
      }
      return {
        ...decorateBlock({
          ...item,
          ...patch,
        }),
      };
    });
    this.setData({ blocks });
  },

  onToggleWeekday(e) {
    const { key, localKey } = e.currentTarget.dataset;
    const block = this.data.blocks.find((item) => item.localKey === localKey);
    if (!block) {
      return;
    }

    const nextWeekdays = block.weekdays.includes(key)
      ? block.weekdays.filter((item) => item !== key)
      : [...block.weekdays, key];
    const orderedWeekdays = weekdayOptions.map((item) => item.key).filter((item) => nextWeekdays.includes(item));

    this.updateBlock(localKey, {
      weekdays: orderedWeekdays,
    });
  },

  onInputChange(e) {
    const { field, localKey } = e.currentTarget.dataset;
    this.updateBlock(localKey, {
      [field]: e.detail.value,
    });
  },

  onDateChange(e) {
    const { field, localKey } = e.currentTarget.dataset;
    this.updateBlock(localKey, {
      [field]: e.detail.value,
    });
  },

  onCalculateEndDate(e) {
    const { localKey } = e.currentTarget.dataset;
    const block = this.data.blocks.find((item) => item.localKey === localKey);
    if (!block) {
      return;
    }

    const endDate = calculateEstimatedEndDate({
      startDate: block.startDate,
      weekdays: block.weekdays,
      startTime: block.startTime,
      endTime: block.endTime,
      totalHours: block.totalHours,
      restMonthlyLimit: this.data.restMonthlyLimit,
    });

    if (!endDate) {
      wx.showToast({
        title: "请先补完整开始日期、星期、时间和总时长",
        icon: "none",
      });
      return;
    }

    this.updateBlock(localKey, { endDate });
    wx.showToast({
      title: "结束日期已计算",
      icon: "success",
    });
  },

  onAddBlock() {
    const selectedCourse = this.data.courses.find((item) => item.id === this.data.selectedCourseId);
    const blocks = [
      ...this.data.blocks,
      decorateBlock(createEmptyBlock({
        totalHours: selectedCourse?.totalDuration || "",
      })),
    ];
    this.setData({ blocks });
  },

  onRemoveBlock(e) {
    const { localKey } = e.currentTarget.dataset;
    if (this.data.blocks.length <= 1) {
      wx.showToast({
        title: "至少保留一段排期",
        icon: "none",
      });
      return;
    }

    this.setData({
      blocks: this.data.blocks.filter((item) => item.localKey !== localKey),
    });
  },

  validateBlocks() {
    if (!this.data.selectedCourseId) {
      return "请先选择课程";
    }

    if (!this.data.blocks.length) {
      return "请至少保留一段排期";
    }

    const selectedCourseExists = this.data.existingCourseIds.includes(this.data.selectedCourseId);
    if (!selectedCourseExists && this.data.activePlanCount >= this.data.maxActiveCourses) {
      return "当前最多只能同时编排 3 门课程";
    }

    for (const block of this.data.blocks) {
      if (!block.startDate) {
        return "请先选择课程开始日期";
      }
      if (!block.weekdays.length) {
        return "请先为每段排期选择上课星期";
      }
      if (!`${block.startTime}`.trim() || !`${block.endTime}`.trim()) {
        return "请先补齐开始和结束时间";
      }
      if (block.startTime >= block.endTime) {
        return "结束时间需要晚于开始时间";
      }
      if (!`${block.totalHours}`.trim() || Number(block.totalHours) <= 0) {
        return "请先填写课程总时长";
      }
      if (!block.endDate) {
        return "请先计算或填写课程结束日期";
      }
      if (block.endDate < block.startDate) {
        return "结束日期不能早于开始日期";
      }
    }

    for (let index = 0; index < this.data.blocks.length; index += 1) {
      const current = this.data.blocks[index];
      for (let cursor = index + 1; cursor < this.data.blocks.length; cursor += 1) {
        const other = this.data.blocks[cursor];
        const dateSeparated =
          (current.endDate && current.endDate < other.startDate) ||
          (other.endDate && other.endDate < current.startDate);
        if (dateSeparated) {
          continue;
        }
        if (!hasWeekdayOverlap(current.weekdays, other.weekdays)) {
          continue;
        }
        if (isTimeOverlap(current.startTime, current.endTime, other.startTime, other.endTime)) {
          return "同一门课的不同排期不能在相同时间重叠";
        }
      }
    }

    return "";
  },

  async onSavePlan() {
    const errorMessage = this.validateBlocks();
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

    const selectedCourse = this.data.courses.find((item) => item.id === this.data.selectedCourseId);
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

      const currentCoursePlans = existingPlans.filter((item) => item.courseId === this.data.selectedCourseId);
      const otherCoursePlans = existingPlans.filter((item) => item.courseId !== this.data.selectedCourseId);

      const conflictingPlan = this.data.blocks.find((block) =>
        otherCoursePlans.find((item) => {
          if (
            (item.endDate && item.endDate < block.startDate) ||
            (block.endDate && getPlanStartDateKey(item) && getPlanStartDateKey(item) > block.endDate)
          ) {
            return false;
          }
          if (!hasWeekdayOverlap(block.weekdays, getPlanWeekdays(item))) {
            return false;
          }
          return isTimeOverlap(block.startTime.trim(), block.endTime.trim(), item.startTime, item.endTime);
        })
      );

      if (conflictingPlan) {
        wx.showToast({
          title: "存在与其他课程冲突的时段",
          icon: "none",
        });
        return;
      }

      const keptIds = new Set();
      const now = new Date();

      for (const block of this.data.blocks) {
        const weekdayLabels = weekdayOptions
          .filter((item) => block.weekdays.includes(item.key))
          .map((item) => item.label);
        const payload = {
          openid,
          courseId: this.data.selectedCourseId,
          courseName: selectedCourse ? selectedCourse.name : "未命名课程",
          colorClass: selectedCourse ? selectedCourse.colorClass : "course-color-sage",
          weekdays: [...block.weekdays],
          weekdayLabels,
          weekdayLabel: weekdayLabels.join("、"),
          startDate: block.startDate,
          endDate: block.endDate,
          startTime: block.startTime.trim(),
          endTime: block.endTime.trim(),
          sessionMinutes: minutesBetweenTimes(block.startTime.trim(), block.endTime.trim()),
          totalHours: Number(block.totalHours),
          totalMinutes: Math.round(Number(block.totalHours) * 60),
          restMonthlyLimit: this.data.restMonthlyLimit,
          note: block.note.trim(),
          status: "active",
          updatedAt: now,
        };

        if (block.id) {
          keptIds.add(block.id);
          await db.collection("user_course_plans").doc(block.id).update({
            data: payload,
          });
        } else {
          const result = await db.collection("user_course_plans").add({
            data: {
              ...payload,
              createdAt: now,
            },
          });
          keptIds.add(result._id);
        }
      }

      const removedPlanIds = currentCoursePlans
        .filter((item) => !keptIds.has(item._id))
        .map((item) => item._id);

      for (const planId of removedPlanIds) {
        await db.collection("user_course_plans").doc(planId).update({
          data: {
            openid,
            status: "inactive",
            updatedAt: now,
          },
        });
      }

      wx.showToast({
        title: "课程排期已保存",
        icon: "success",
      });

      await this.loadPlanCount();
      await this.loadCoursePlans(this.data.selectedCourseId, {
        preservePrefillBlock: false,
      });

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
});
