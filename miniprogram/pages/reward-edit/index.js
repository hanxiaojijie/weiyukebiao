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
const db = wx.cloud.database();

Page({
  data: {
    themeKey: "strawberry",
    progressPercent: 0,
    saving: false,
    rewardId: "",
    form: {
      title: "",
      targetCredits: "",
      description: "",
      manualAdjustment: "0",
    },
  },

  onShow() {
    applyTheme(this);
    this.loadReward();
  },

  async loadReward() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }

      const [rewardDoc, creditRule, checkins] = await Promise.all([
        ensureSingleDoc("rewards", DEFAULT_REWARD, openid),
        ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid),
        fetchAllDocs("checkins", {
          where: {
            openid,
            status: "done",
          },
          pageSize: 100,
        }),
      ]);
      const totalCredits = sumCreditLedger(checkins, creditRule);
      const progress = calcRewardProgress(
        totalCredits,
        rewardDoc
      );
      this.setData({
        rewardId: rewardDoc._id,
        progressPercent: progress.progressPercent,
        form: {
          title: rewardDoc.title || "",
          targetCredits: `${rewardDoc.targetCredits || ""}`,
          description: rewardDoc.description || "",
          manualAdjustment: `${rewardDoc.manualAdjustment || 0}`,
        },
      });
    } catch (error) {
      console.error("读取奖励失败", error);
    }
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  async onSaveReward() {
    const openid = await ensureLogin();
    if (!openid) {
      wx.showToast({
        title: "登录初始化失败",
        icon: "none",
      });
      return;
    }

    const { rewardId, form } = this.data;
    const title = form.title.trim();
    const targetCredits = Number(form.targetCredits);
    const description = form.description.trim();
    const manualAdjustment = Number(form.manualAdjustment || 0);

    if (!title || !targetCredits || targetCredits <= 0) {
      wx.showToast({
        title: "请先填写完整奖励信息",
        icon: "none",
      });
      return;
    }

    this.setData({ saving: true });
    try {
      await db.collection("rewards").doc(rewardId).update({
        data: {
          openid,
          title,
          targetCredits,
          description,
          manualAdjustment,
          updatedAt: new Date(),
        },
      });
      wx.showToast({
        title: "奖励已保存",
        icon: "success",
      });
      this.loadReward();
    } catch (error) {
      console.error("保存奖励失败", error);
      wx.showToast({
        title: "保存失败",
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
