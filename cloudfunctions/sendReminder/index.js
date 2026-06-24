// 定时扫描日历提醒，发送订阅消息（一次性订阅，每条授权只发一次）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 模板：订阅行程日历提醒
// 字段：thing12(日程名称) time13(开始时间) thing4(事项地点) thing9(备注)
const TMPL_ID = 'CRQroT2ciQQwC2CmJ9TB5_r7GmF9wvf9-zFI_G6zzlc';

exports.main = async (event, context) => {
  // 云函数环境为 UTC，转北京时间（+8 小时）
  const now = new Date();
  const cnNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const nowTime = `${String(cnNow.getUTCHours()).padStart(2, '0')}:${String(cnNow.getUTCMinutes()).padStart(2, '0')}`;
  const today = `${cnNow.getUTCFullYear()}-${String(cnNow.getUTCMonth() + 1).padStart(2, '0')}-${String(cnNow.getUTCDate()).padStart(2, '0')}`;

  console.log(`[sendReminder] 触发时间: ${today} ${nowTime}`);

  try {
    // 查当天所有事件，再过滤 reminder
    const { data: allEvents } = await db.collection('calendar')
      .where({ date: today })
      .get();

    console.log(`[sendReminder] 当天事件: ${allEvents.length} 条`);

    // 兼容 reminder 可能是布尔 true 或字符串 "true"
    const events = allEvents.filter(e => e.reminder === true || e.reminder === 'true');

    console.log(`[sendReminder] reminder=true 事件: ${events.length} 条`);

    if (!events.length) return { success: true, sent: 0, checked: allEvents.length };

    // 读取该用户的全局提醒开关
    const openidFromEvent = events[0]._openid;
    if (openidFromEvent) {
      const { data: users } = await db.collection('users').where({ openid: openidFromEvent }).limit(1).get();
      if (users.length && users[0].globalReminderEnabled === false) {
        return { success: true, sent: 0, checked: events.length, globalOff: true };
      }
    }

    let sent = 0;

    for (const evt of events) {
      // 计算距离开始还有多少分钟
      const eventMinutes = timeToMinutes(evt.time);
      const nowMinutes = timeToMinutes(nowTime);
      const diff = eventMinutes - nowMinutes;

      // 提前 reminderTime 分钟提醒（默认提前 5 分钟，在 5 分钟窗口内触发）
      const remindBefore = evt.reminderTime || 5;
      console.log(`[sendReminder] 事件="${evt.title}" time=${evt.time} diff=${diff}min remindBefore=${remindBefore}`);
      const windowStart = remindBefore;
      const windowEnd = remindBefore - 5;

      if (diff <= windowStart && diff > windowEnd) {
        // 查 users 表拿 openid（日历事件关联 tripId 或直接有 openid）
        let openid = evt._openid;
        if (!openid) {
          const { data: users } = await db.collection('users').limit(1).get();
          if (users.length) openid = users[0]._openid;
        }

        if (openid) {
          await cloud.openapi.subscribeMessage.send({
            touser: openid,
            templateId: TMPL_ID,
            page: '/pages/calendar/index',
            data: {
              thing12: { value: evt.title.slice(0, 20) },
              time13: { value: `${today} ${evt.time}` },
              thing4: { value: evt.location || '未指定地点' },
              thing9: { value: evt.description || '行程即将开始' }
            }
          });
          // 一次性订阅消耗后标记已发送，防止重复
          await db.collection('calendar').doc(evt._id).update({
            data: { reminder: false }
          });
          sent++;
        }
      }
    }

    return { success: true, sent, checked: events.length };
  } catch (err) {
    console.error('[sendReminder]', err);
    return { success: false, error: err.message };
  }
};

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
