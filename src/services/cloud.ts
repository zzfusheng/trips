/**
 * 云开发数据层 — 替代 Taro.Storage
 *
 * 集合：
 *   trips         — 用户行程
 *   chat_history  — 聊天记录
 *   calendar      — 日历同步事件
 *   users         — 用户信息（openid/设备/登录）
 *
 * 数据查看：微信开发者工具 → 云开发控制台 → 数据库
 */

import Taro from '@tarojs/taro';
import type { TripPlan, CalendarEvent, Destination } from '@/types/trip';

// ---------- 工具 ----------
const db = () => Taro?.cloud?.database() as any;
const coll = (name: string) => db()?.collection(name);

/** 生成唯一 ID */
export const genId = (prefix = '') => prefix + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

// ==================== 行程 ====================

/** 获取用户所有行程 */
export async function fetchTrips(): Promise<TripPlan[]> {
  try {
    const { data } = await coll('trips')
      .orderBy('updatedAt', 'desc')
      .get();
    return data || [];
  } catch {
    return [];
  }
}

/** 按 ID 获取行程 */
export async function fetchTrip(id: string): Promise<TripPlan | null> {
  try {
    const { data } = await coll('trips').where({ id }).limit(1).get();
    return (data && data.length) ? data[0] : null;
  } catch {
    return null;
  }
}

/** 保存 / 更新行程 */
export async function saveTrip(trip: TripPlan): Promise<void> {
  try {
    const existing = await fetchTrip(trip.id);
    const payload = { ...trip, updatedAt: new Date().toISOString() };
    if (existing) {
      // existing._id 是云数据库的主键，用于 update
      await coll('trips').doc((existing as any)._id).update({ data: payload });
    } else {
      await coll('trips').add({ data: { ...payload, createdAt: new Date().toISOString() } });
    }
  } catch (e) {
    console.warn('[Cloud] saveTrip 失败', e);
    fallbackSet('my_trips_fb', trip);
  }
}

/** 删除行程 */
export async function deleteTrip(id: string): Promise<void> {
  try {
    const { data } = await coll('trips').where({ id }).limit(1).get();
    if (data && data.length) {
      await coll('trips').doc(data[0]._id).remove();
    }
  } catch (e) {
    console.warn('[Cloud] deleteTrip 失败', e);
    fallbackRemove('my_trips_fb', id);
  }
}

// ==================== 聊天历史 ====================

/** 获取用户聊天历史 */
export async function fetchChatHistory(openid: string): Promise<{ role: string; content: string }[]> {
  try {
    const { data } = await coll('chat_history')
      .where({ _openid: openid })
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();
    if (data && data.length) return data[0].messages || [];
  } catch {}
  return [];
}

/** 保存聊天历史 */
export async function saveChatHistory(openid: string, messages: { role: string; content: string }[]): Promise<void> {
  try {
    const { data } = await coll('chat_history')
      .where({ _openid: openid })
      .limit(1)
      .get();
    if (data && data.length) {
      await coll('chat_history').doc(data[0]._id).update({
        data: { messages, updatedAt: new Date().toISOString() }
      });
    } else {
      await coll('chat_history').add({
        data: { _openid: openid, messages, updatedAt: new Date().toISOString() }
      });
    }
  } catch {}
}

// ==================== 日历事件 ====================

/** 获取用户的日历事件 */
export async function fetchCalendarEvents(tripId?: string): Promise<CalendarEvent[]> {
  try {
    let q = coll('calendar');
    if (tripId) q = q.where({ tripId });
    const { data } = await q.orderBy('date', 'asc').get();
    return data || [];
  } catch {
    return [];
  }
}

/** 检查是否有其他行程的日历事件在相同日期 */
export async function checkCalendarConflict(tripId: string, dates: string[]): Promise<{ hasConflict: boolean; conflictTripIds: string[] }> {
  try {
    const result: string[] = [];
    for (const date of dates) {
      const { data } = await coll('calendar')
        .where({ date, tripId: db().command.neq(tripId) })
        .limit(1)
        .get();
      if (data && data.length) {
        const ctId = data[0].tripId || '';
        if (ctId && !result.includes(ctId)) result.push(ctId);
      }
    }
    return { hasConflict: result.length > 0, conflictTripIds: result };
  } catch {
    return { hasConflict: false, conflictTripIds: [] };
  }
}
export async function saveCalendarEvents(tripId: string, events: CalendarEvent[]): Promise<void> {
  try {
    // 先删旧事件
    const { data: old } = await coll('calendar').where({ tripId }).get();
    for (const e of (old || [])) {
      await coll('calendar').doc(e._id).remove();
    }
    // 批量写入新事件
    for (const e of events) {
      await coll('calendar').add({ data: e });
    }
  } catch {
    console.warn('[Cloud] saveCalendarEvents 失败');
  }
}

/** 添加单条手动日历事件 */
export async function addCalendarEvent(event: CalendarEvent): Promise<void> {
  try {
    await coll('calendar').add({ data: event });
  } catch (err) {
    console.warn('[Cloud] addCalendarEvent 失败');
    throw err;
  }
}

/** 替换同日期同时间的日历事件（冲突时覆盖） */
export async function upsertCalendarEvent(event: CalendarEvent): Promise<void> {
  try {
    const { data } = await coll('calendar')
      .where({ date: event.date, time: event.time })
      .get();
    if (data && data.length) {
      // 更新已有
      await coll('calendar').doc(data[0]._id).update({ data: event });
    } else {
      // 新增
      await coll('calendar').add({ data: event });
    }
  } catch (err) {
    console.warn('[Cloud] upsertCalendarEvent 失败');
    throw err;
  }
}

/** 更新单条日历事件（提醒开关等） */
export async function updateCalendarEvent(id: string, fields: Partial<CalendarEvent>): Promise<void> {
  try {
    const { data } = await coll('calendar').where({ id }).get();
    if (data && data.length) {
      await coll('calendar').doc(data[0]._id).update({ data: fields });
    }
  } catch {
    console.warn('[Cloud] updateCalendarEvent 失败');
  }
}

/** 删除单条日历事件 */
export async function deleteCalendarEvent(id: string): Promise<void> {
  try {
    const { data } = await coll('calendar').where({ id }).get();
    if (data && data.length) {
      await coll('calendar').doc(data[0]._id).remove();
    }
  } catch {
    console.warn('[Cloud] deleteCalendarEvent 失败');
  }
}

// ==================== 降级（Storage 兜底） ====================

function fallbackSet(key: string, trip: TripPlan) {
  try {
    const raw = Taro.getStorageSync(key);
    const arr: TripPlan[] = raw ? JSON.parse(raw) : [];
    const idx = arr.findIndex(t => t.id === trip.id);
    if (idx >= 0) arr[idx] = trip;
    else arr.push(trip);
    Taro.setStorageSync(key, JSON.stringify(arr));
  } catch {}
}

function fallbackRemove(key: string, id: string) {
  try {
    const raw = Taro.getStorageSync(key);
    if (!raw) return;
    const arr: TripPlan[] = JSON.parse(raw);
    Taro.setStorageSync(key, JSON.stringify(arr.filter(t => t.id !== id)));
  } catch {}
}

// ==================== 用户记录 ====================

export interface UserRecord {
  openid: string;
  avatar?: string;        // 头像 URL
  coverImage?: string;    // 个人主页背景图
  nickname?: string;      // 昵称
  bio?: string;           // 简介
  favorites?: Destination[]; // 收藏的目的地
  phone?: string;
  location?: string;      // 登录地（需后端 IP 反查）
  lastLoginAt: string;
  deviceModel: string;    // 手机型号
  deviceBrand: string;
  osVersion: string;
  wxVersion: string;
  createdAt: string;
  updatedAt: string;
}

/** 更新用户个人资料（头像/昵称/简介） */
export async function updateUserProfile(openid: string, fields: { avatar?: string; coverImage?: string; nickname?: string; bio?: string }): Promise<void> {
  try {
    const { data } = await coll('users').where({ openid }).limit(1).get();
    if (data && data.length > 0) {
      await coll('users').doc(data[0]._id).update({
        data: { ...fields, updatedAt: new Date().toISOString() }
      });
      console.log('[Cloud] 用户资料已更新');
    } else {
      console.warn('[Cloud] 用户不存在, 无法更新资料');
    }
  } catch (err) {
    console.warn('[Cloud] updateUserProfile 失败:', err);
  }
}

/** 设置全局提醒开关（同步到云端） */
export async function setGlobalReminder(openid: string, enabled: boolean): Promise<void> {
  try {
    const { data } = await coll('users').where({ openid }).limit(1).get();
    if (data && data.length > 0) {
      await coll('users').doc(data[0]._id).update({
        data: { globalReminderEnabled: enabled }
      });
    } else {
      await coll('users').add({ data: { openid, globalReminderEnabled: enabled } });
    }
  } catch (err) {
    console.warn('[Cloud] setGlobalReminder 失败:', err);
  }
}

/** 获取全局提醒开关（从云端） */
export async function getGlobalReminder(openid: string): Promise<boolean | null> {
  try {
    const { data } = await coll('users').where({ openid }).limit(1).get();
    if (data && data.length > 0) {
      const val = data[0].globalReminderEnabled;
      return val !== undefined ? !!val : null;
    }
  } catch (err) {
    console.warn('[Cloud] getGlobalReminder 失败:', err);
  }
  return null;
}

/** 获取用户资料 */
export async function fetchUserProfile(openid: string): Promise<UserRecord | null> {
  try {
    const { data } = await coll('users').where({ openid }).limit(1).get();
    if (data && data.length > 0) return data[0] as UserRecord;
  } catch (err) {
    console.warn('[Cloud] fetchUserProfile 失败:', err);
  }
  return null;
}

/**
 * 记录/更新用户信息
 * 每次 app onLaunch 调用，upsert 方式：有则更新，无则新增
 */
export async function recordUser(info: {
  openid: string;
  phone?: string;
  location?: string;
}): Promise<void> {
  try {
    const sys = Taro.getSystemInfoSync();
    const now = new Date().toISOString();
    const userData: UserRecord = {
      openid: info.openid,
      phone: info.phone || '',
      location: info.location || '',
      lastLoginAt: now,
      deviceModel: sys.model || '',
      deviceBrand: sys.brand || '',
      osVersion: sys.system || '',
      wxVersion: sys.version || '',
      createdAt: now,
      updatedAt: now
    };

    // 查是否已存在
    const { data } = await coll('users')
      .where({ openid: info.openid })
      .limit(1)
      .get();

    if (data && data.length > 0) {
      // 更新登录时间和设备信息，保留原有 createdAt
      await coll('users').doc(data[0]._id).update({
        data: {
          ...userData,
          createdAt: data[0].createdAt || now
        }
      });
      console.log('[Cloud] 用户已更新:', info.openid);
    } else {
      await coll('users').add({ data: userData });
      console.log('[Cloud] 新增用户:', info.openid);
    }
  } catch (err) {
    console.warn('[Cloud] recordUser 失败:', err);
  }
}

// ==================== 收藏目的地 ====================

/** 获取用户收藏的目的地 */
export async function fetchFavorites(openid: string): Promise<Destination[]> {
  try {
    const { data } = await coll('users').where({ openid }).limit(1).get();
    if (data && data.length > 0 && data[0].favorites) {
      return data[0].favorites as Destination[];
    }
  } catch (err) {
    console.warn('[Cloud] fetchFavorites 失败:', err);
  }
  return [];
}

/** 保存用户收藏的目的地 */
export async function saveFavorites(openid: string, favorites: Destination[]): Promise<void> {
  try {
    const { data } = await coll('users').where({ openid }).limit(1).get();
    if (data && data.length > 0) {
      await coll('users').doc(data[0]._id).update({
        data: { favorites, updatedAt: new Date().toISOString() }
      });
      console.log('[Cloud] 收藏已保存:', favorites.length, '条');
    }
  } catch (err) {
    console.warn('[Cloud] saveFavorites 失败:', err);
  }
}

// ==================== 打卡 ====================

/** 更新行程打卡状态 */
export async function updateTripCheckIn(tripId: string, checkedIn: boolean): Promise<void> {
  try {
    const { data } = await coll('trips').where({ id: tripId }).limit(1).get();
    if (data && data.length > 0) {
      await coll('trips').doc(data[0]._id).update({
        data: { checkedIn, updatedAt: new Date().toISOString() }
      });
    }
  } catch (e) {
    console.warn('[Cloud] updateTripCheckIn 失败', e);
  }
}

/** 获取打卡统计 */
export async function fetchCheckInStats(): Promise<{ tripCount: number; cityCount: number; dayCount: number }> {
  try {
    const { data } = await coll('trips').where({ checkedIn: true }).get();
    const trips: TripPlan[] = data || [];
    const cities = new Set(trips.map(t => t.destination).filter(Boolean));
    const days = trips.reduce((sum, t) => sum + (t.days || 0), 0);
    return { tripCount: trips.length, cityCount: cities.size, dayCount: days };
  } catch {
    return { tripCount: 0, cityCount: 0, dayCount: 0 };
  }
}

// ==================== 账号注销 ====================

/** 注销账号：删除用户所有云端数据 */
export async function deleteAccount(openid: string): Promise<void> {
  try {
    // 删除用户记录
    const { data: userData } = await coll('users').where({ openid }).limit(1).get();
    if (userData && userData.length) {
      await coll('users').doc(userData[0]._id).remove();
    }
    // 删除该用户所有行程
    const { data: trips } = await coll('trips').where({ _openid: openid }).get();
    for (const t of (trips || [])) {
      await coll('trips').doc(t._id).remove();
    }
    // 删除日历事件
    const { data: cal } = await coll('calendar').where({ _openid: openid }).get();
    for (const c of (cal || [])) {
      await coll('calendar').doc(c._id).remove();
    }
    // 删除聊天历史
    const { data: chat } = await coll('chat_history').where({ _openid: openid }).get();
    for (const h of (chat || [])) {
      await coll('chat_history').doc(h._id).remove();
    }
    console.log('[Cloud] 账号已注销:', openid);
  } catch (e) {
    console.warn('[Cloud] deleteAccount 失败:', e);
    throw e;
  }
}

// ==================== 意见反馈 ====================

/** 提交意见反馈 */
export async function submitFeedback(openid: string, content: string, contact?: string): Promise<void> {
  try {
    await coll('feedbacks').add({
      data: {
        openid,
        content,
        contact: contact || '',
        createdAt: new Date().toISOString()
      }
    });
  } catch (e) {
    console.warn('[Cloud] submitFeedback 失败:', e);
    throw e;
  }
}
