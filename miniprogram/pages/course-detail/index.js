const { applyTheme } = require("../../utils/theme");
const { ensureLogin } = require("../../utils/auth");
const { fetchAllDocs } = require("../../utils/database");
const { getDateKey } = require("../../utils/schedule");

const db = wx.cloud.database();

function parseMaterials(materialsText = "") {
  return materialsText
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const urlMatch = item.match(/https?:\/\/\S+/);
      return {
        id: `material-${index}`,
        title: item,
        url: urlMatch ? urlMatch[0] : "",
        type: urlMatch ? "链接" : "资料",
      };
    });
}

function formatMinutes(minutes) {
  const totalMinutes = Number(minutes || 0);
  if (!totalMinutes) {
    return "0 h";
  }

  const hours = Math.floor(totalMinutes / 60);
  const remain = totalMinutes % 60;
  if (!hours) {
    return `${remain} min`;
  }
  if (!remain) {
    return `${hours} h`;
  }
  return `${hours} h ${remain} min`;
}

Page({
  data: {
    themeKey: "strawberry",
    courseId: "",
    loading: true,
    course: null,
    materials: [],
    metrics: {
      activePlans: 0,
      finishedCount: 0,
      totalMinutes: 0,
      totalCredits: 0,
    },
  },

  onLoad(options) {
    this.setData({
      courseId: options.id || "",
    });
  },

  onShow() {
    applyTheme(this);
    this.loadCourseDetail();
  },

  async loadCourseDetail() {
    const { courseId } = this.data;
    if (!courseId) {
      wx.showToast({
        title: "课程不存在",
        icon: "none",
      });
      return;
    }

    this.setData({ loading: true });

    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const [courseRes, planRes, checkins] = await Promise.all([
        db.collection("courses").doc(courseId).get(),
        db
          .collection("user_course_plans")
          .where({
            openid,
            courseId,
            status: "active",
          })
          .limit(50)
          .get(),
        fetchAllDocs("checkins", {
          where: {
            openid,
            courseId,
          },
          pageSize: 100,
        }),
      ]);

      const course = courseRes.data || {};
      const materials = parseMaterials(course.materials || "");
      const finishedCheckins = checkins.filter((item) => item.status === "done");
      const todayKey = getDateKey(new Date());
      const metrics = {
        activePlans: planRes.data.filter((item) => !item.endDate || item.endDate >= todayKey).length,
        finishedCount: finishedCheckins.length,
        totalMinutes: finishedCheckins.reduce(
          (sum, item) => sum + Number(item.actualMinutes || item.plannedMinutes || 0),
          0
        ),
        totalCredits: checkins.reduce(
          (sum, item) => sum + Number(item.earnedCredits || 0),
          0
        ),
      };
      metrics.totalDurationText = formatMinutes(metrics.totalMinutes);

      this.setData({
        course: {
          id: course._id,
          name: course.name || "未命名课程",
          category: course.category || "未分类",
          description: course.description || "暂无课程简介",
          totalDuration: course.totalDuration || "未填写",
          link: course.link || "",
          notes: course.notes || "",
          tags: course.tags || [],
          colorName: course.colorName || "未设颜色",
          colorClass: course.colorClass || "course-color-sage",
        },
        materials,
        metrics,
      });
    } catch (error) {
      console.error("读取课程详情失败", error);
      wx.showToast({
        title: "课程详情读取失败",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  goSchedule() {
    const { courseId } = this.data;
    wx.navigateTo({
      url: `/pages/schedule-edit/index${courseId ? `?courseId=${courseId}` : ""}`,
    });
  },

  goEditCourse() {
    const { courseId } = this.data;
    if (!courseId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/course-edit/index?id=${courseId}`,
    });
  },

  onCopyCourseLink() {
    const link = this.data.course?.link || "";
    if (!link) {
      wx.showToast({
        title: "还没有课程链接",
        icon: "none",
      });
      return;
    }

    wx.setClipboardData({
      data: link,
    });
  },

  onCopyMaterial(e) {
    const { content } = e.currentTarget.dataset;
    if (!content) {
      return;
    }

    wx.setClipboardData({
      data: content,
    });
  },
});
