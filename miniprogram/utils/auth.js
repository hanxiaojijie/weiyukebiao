function getAppInstance() {
  try {
    return getApp();
  } catch (error) {
    return null;
  }
}

async function ensureLogin() {
  const app = getAppInstance();
  if (!app || typeof app.ensureLogin !== "function") {
    return "";
  }

  return app.ensureLogin();
}

function getOpenid() {
  const app = getAppInstance();
  return app?.globalData?.openid || "";
}

function getUserProfile() {
  const app = getAppInstance();
  return app?.globalData?.userProfile || null;
}

async function updateUserProfile(patch) {
  const app = getAppInstance();
  if (!app || typeof app.updateUserProfile !== "function") {
    throw new Error("update user profile unavailable");
  }

  return app.updateUserProfile(patch);
}

module.exports = {
  ensureLogin,
  getOpenid,
  getUserProfile,
  updateUserProfile,
};
