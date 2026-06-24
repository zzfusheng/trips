const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { content, contact } = event;
  const { OPENID } = cloud.getWXContext();

  if (!content || !content.trim()) {
    return { success: false, error: '反馈内容不能为空' };
  }

  try {
    await db.collection('feedbacks').add({
      data: {
        openid: OPENID,
        content: content.trim(),
        contact: contact || '',
        createdAt: new Date().toISOString()
      }
    });
    return { success: true };
  } catch (e) {
    console.error('submitFeedback error:', e);
    return { success: false, error: e.message };
  }
};
