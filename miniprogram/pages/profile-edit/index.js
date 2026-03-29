const { applyTheme } = require("../../utils/theme");
const { ensureLogin, getUserProfile, updateUserProfile } = require("../../utils/auth");

Page({
  data: {
    themeKey: "strawberry",
    saving: false,
    displayInitial: "学",
    form: {
      nickname: "学习者",
      avatarUrl: "",
      intro: "给迷茫的职场人，一条稳定提升的成长通道。",
    },
  },

  onShow() {
    applyTheme(this);
    this.loadProfile();
  },

  async loadProfile() {
    await ensureLogin();
    const profile = getUserProfile();
    const nickname = profile?.nickname || "学习者";
    this.setData({
      displayInitial: nickname.slice(0, 1),
      form: {
        nickname,
        avatarUrl: profile?.avatarUrl || "",
        intro: profile?.intro || "给迷茫的职场人，一条稳定提升的成长通道。",
      },
    });
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl || "";
    this.setData({
      "form.avatarUrl": avatarUrl,
    });
  },

  onNicknameInput(e) {
    const nickname = e.detail.value;
    this.setData({
      displayInitial: (nickname || "学").slice(0, 1),
      "form.nickname": nickname,
    });
  },

  onIntroInput(e) {
    this.setData({
      "form.intro": e.detail.value,
    });
  },

  async onSave() {
    const nickname = this.data.form.nickname.trim();
    if (!nickname) {
      wx.showToast({
        title: "请先填写昵称",
        icon: "none",
      });
      return;
    }

    this.setData({ saving: true });
    try {
      await updateUserProfile({
        nickname,
        avatarUrl: this.data.form.avatarUrl,
        intro: this.data.form.intro.trim(),
      });
      wx.showToast({
        title: "已保存",
        icon: "success",
      });
      setTimeout(() => {
        wx.navigateBack({
          delta: 1,
        });
      }, 350);
    } catch (error) {
      console.error("保存个人信息失败", error);
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({ saving: false });
    }
  },
});
