const { applyTheme } = require("../../utils/theme");
const { ensureLogin } = require("../../utils/auth");

const db = wx.cloud.database();

const categoryColorMap = {
  "编程开发": { key: "plum", name: "灰莓紫", className: "course-color-plum" },
  "AI/数据": { key: "sage", name: "雾松绿", className: "course-color-sage" },
  "硬件设计": { key: "teal", name: "烟青蓝", className: "course-color-teal" },
  "测试开发": { key: "blue", name: "雾蓝灰", className: "course-color-blue" },
  "产品运营": { key: "olive", name: "苔原橄榄", className: "course-color-olive" },
  "设计创作": { key: "plum", name: "灰莓紫", className: "course-color-plum" },
  "语言考试": { key: "blue", name: "雾蓝灰", className: "course-color-blue" },
  "其他": { key: "olive", name: "苔原橄榄", className: "course-color-olive" },
};

const courseCategories = [
  "编程开发",
  "AI/数据",
  "硬件设计",
  "测试开发",
  "产品运营",
  "设计创作",
  "语言考试",
  "其他",
];

function getInitialForm() {
  return {
    name: "",
    category: "",
    totalDuration: "",
    description: "",
    link: "",
    materials: "",
    tags: "",
    notes: "",
  };
}

Page({
  data: {
    themeKey: "strawberry",
    mode: "create",
    courseId: "",
    courseCategories,
    selectedCategoryIndex: -1,
    form: getInitialForm(),
    saving: false,
    pageTitle: "录入课程",
    pageDesc: "课程信息尽量录完整，后面别人选课、排期、打卡和管理资料时才会顺手。",
    saveButtonText: "保存课程",
  },

  onLoad(options) {
    const courseId = options.id || "";
    if (courseId) {
      this.setData({
        mode: "edit",
        courseId,
        pageTitle: "编辑课程",
        pageDesc: "直接修改课程信息，保存后共享课程库和课程详情会同步更新。",
        saveButtonText: "保存修改",
      });
    }
  },

  onShow() {
    applyTheme(this);
    if (this.data.mode === "edit" && this.data.courseId) {
      this.loadCourseDetail();
    }
  },

  async loadCourseDetail() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        throw new Error("missing openid");
      }

      const { data } = await db.collection("courses").doc(this.data.courseId).get();
      if (data._openid && data._openid !== openid) {
        wx.showToast({
          title: "你只能编辑自己创建的课程",
          icon: "none",
        });
        setTimeout(() => {
          wx.navigateBack({
            delta: 1,
          });
        }, 300);
        return;
      }

      this.setData({
        form: {
          name: data.name || "",
          category: data.category || "",
          totalDuration: data.totalDuration || "",
          description: data.description || "",
          link: data.link || "",
          materials: data.materials || "",
          tags: Array.isArray(data.tags) ? data.tags.join(" / ") : data.tags || "",
          notes: data.notes || "",
        },
        selectedCategoryIndex: courseCategories.indexOf(data.category || ""),
      });
    } catch (error) {
      console.error("读取课程失败", error);
      wx.showToast({
        title: error?.message === "missing openid" ? "登录初始化失败" : "课程读取失败",
        icon: "none",
      });
    }
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`form.${field}`]: value,
    });
  },

  onCategoryChange(e) {
    const index = Number(e.detail.value);
    const category = courseCategories[index] || "";
    this.setData({
      selectedCategoryIndex: index,
      "form.category": category,
    });
  },

  getCategoryColor(category) {
    return categoryColorMap[category] || categoryColorMap["其他"];
  },

  validateForm() {
    const { name, category, totalDuration, description, link } = this.data.form;

    if (!name.trim()) {
      return "请先填写课程名称";
    }

    if (!category.trim()) {
      return "请先填写课程类别";
    }

    if (!totalDuration.trim()) {
      return "请先填写课程总用时";
    }

    if (!/^\d+(\.\d+)?$/.test(totalDuration.trim())) {
      return "课程总用时请填写纯数字";
    }

    if (!description.trim()) {
      return "请先填写课程简介";
    }

    if (!link.trim()) {
      return "请先填写课程链接";
    }

    return "";
  },

  async onSaveCourse() {
    const errorMessage = this.validateForm();
    if (errorMessage) {
      wx.showToast({
        title: errorMessage,
        icon: "none",
      });
      return;
    }

    const { form } = this.data;
    const selectedColor = this.getCategoryColor(form.category.trim());

    this.setData({ saving: true });

    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        totalDuration: form.totalDuration.trim(),
        description: form.description.trim(),
        link: form.link.trim(),
        materials: form.materials.trim(),
        tags: form.tags
          .split(/[、,，/]/)
          .map((item) => item.trim())
          .filter(Boolean),
        notes: form.notes.trim(),
        colorKey: selectedColor.key,
        colorName: selectedColor.name,
        colorClass: selectedColor.className,
        updatedAt: new Date(),
      };

      if (this.data.mode === "edit" && this.data.courseId) {
        await db.collection("courses").doc(this.data.courseId).update({
          data: payload,
        });
      } else {
        await db.collection("courses").add({
          data: {
            ...payload,
            createdAt: new Date(),
          },
        });
      }

      wx.showToast({
        title: this.data.mode === "edit" ? "课程已更新" : "课程已保存",
        icon: "success",
      });

      this.setData({
        form: getInitialForm(),
        selectedCategoryIndex: -1,
      });

      setTimeout(() => {
        wx.navigateBack({
          delta: 1,
        });
      }, 500);
    } catch (error) {
      console.error("保存课程失败", error);
      wx.showToast({
        title: "保存失败，请稍后重试",
        icon: "none",
      });
    } finally {
      this.setData({ saving: false });
    }
  },

  onCopyCourseLink() {
    const { link } = this.data.form;
    if (!link.trim()) {
      wx.showToast({
        title: "先填写课程链接",
        icon: "none",
      });
      return;
    }

    wx.setClipboardData({
      data: link.trim(),
    });
  },
});
