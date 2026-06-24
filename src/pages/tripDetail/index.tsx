import React, { useState } from 'react';
import { View, Text, Image, Input, Picker } from '@tarojs/components';
import Taro, { useRouter, useDidShow } from '@tarojs/taro';
import styles from './index.module.scss';
import { sampleTripPlan } from '@/data/destinations';
import { TripPlan, DayPlan, Activity, CalendarEvent } from '@/types/trip';
import { formatDateCN } from '@/utils/format';
import { handleLinkClick } from '@/utils/linkHandler';
import { fetchTrip, saveTrip, saveCalendarEvents, checkCalendarConflict } from '@/services/cloud';
import { isPicsumEnabled, resolveDestImage } from '@/utils/destImage';

const activityTypes = ['景点', '美食', '住宿', '交通', '其他'];
const typeMap: Record<string, Activity['type']> = {
  '景点': 'sightseeing', '美食': 'food', '住宿': 'hotel', '交通': 'transport', '其他': 'other'
};

const generateId = () => 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

const TripDetailPage: React.FC = () => {
  const router = useRouter();
  const id = router.params?.id;
  const from = router.params?.from || ''; // 'chat' | 'trips'
  const [trip, setTrip] = useState<TripPlan>(sampleTripPlan);
  const [editingAct, setEditingAct] = useState<{ dayIdx: number; actIdx: number } | null>(null);
  const [editForm, setEditForm] = useState({ time: '', title: '', description: '', type: '景点' });

  useDidShow(() => {
    // 从云数据库加载行程
    if (id) {
      fetchTrip(id as string).then(found => {
        if (found) setTrip(found);
      });
    }
  });

  // ---------- 持久化 ----------
  const persistTrip = (newTrip: TripPlan) => {
    setTrip(newTrip);
    // 云数据库保存
    saveTrip(newTrip);
    // 同时保留 storage 用于 current_trip 快速访问
    Taro.setStorageSync('current_trip', JSON.stringify(newTrip));
    // 同步日历（静默更新，不弹冲突框）
    syncCalendar(newTrip, true);
  };

  // ---------- 同步日历 ----------
  const syncCalendar = async (t: TripPlan, skipConflictCheck = false) => {
    try {
      const events: CalendarEvent[] = [];
      t.itinerary.forEach(day => {
        day.activities.forEach(act => {
          events.push({
            id: 'cal_' + act.id,
            title: act.title,
            date: day.date,
            time: act.time || '',
            location: act.location || '',
            description: act.description || '',
            reminder: true,
            reminderTime: 5,
            tripId: t.id,
            type: act.type || 'other'
          });
        });
      });

      if (events.length === 0) return;

      if (!skipConflictCheck) {
        // 检查同一天是否已有其他行程的事件
        const dates = t.itinerary.map(d => d.date).filter(Boolean);
        const { hasConflict } = await checkCalendarConflict(t.id, dates);

        if (hasConflict) {
          const res = await Taro.showModal({
            title: '日历冲突',
            content: '该日期已有其他行程安排，是否替换为新行程？',
            confirmText: '替换',
          cancelText: '保留'
          });
          if (res.confirm) {
            saveCalendarEvents(t.id, events);
            Taro.showToast({ title: '已同步到日历', icon: 'success' });
          }
          return;
        }
      }

      saveCalendarEvents(t.id, events);
      if (!skipConflictCheck) {
        Taro.showToast({ title: '已同步到日历', icon: 'success' });
      }
    } catch (e) {
      console.error('[TripDetail] 日历同步失败:', e);
    }
  };

  // ---------- 删除活动 ----------
  const handleDeleteAct = (dayIdx: number, actIdx: number) => {
    Taro.showModal({
      title: '删除活动',
      content: '确定要删除这个活动吗？',
      success: (res) => {
        if (!res.confirm) return;
        const newTrip = { ...trip, itinerary: trip.itinerary.map((d, di) => {
          if (di !== dayIdx) return d;
          return { ...d, activities: d.activities.filter((_, ai) => ai !== actIdx) };
        })};
        persistTrip(newTrip);
        Taro.showToast({ title: '已删除', icon: 'success' });
      }
    });
  };

  // ---------- 新增活动 ----------
  const handleAddAct = (dayIdx: number) => {
    const newAct: Activity = {
      id: generateId(),
      time: '',
      title: '',
      description: '',
      location: '',
      type: 'other',
      icon: '📌'
    };
    const newTrip = { ...trip, itinerary: trip.itinerary.map((d, di) => {
      if (di !== dayIdx) return d;
      return { ...d, activities: [...d.activities, newAct] };
    })};
    persistTrip(newTrip);
    // 立即进入编辑
    const actIdx = newTrip.itinerary[dayIdx].activities.length - 1;
    setEditForm({ time: '', title: '', description: '', type: '其他' });
    setEditingAct({ dayIdx, actIdx });
  };

  // ---------- 开始编辑 ----------
  const handleStartEdit = (dayIdx: number, actIdx: number) => {
    const act = trip.itinerary[dayIdx].activities[actIdx];
    const typeLabel = Object.entries(typeMap).find(([, v]) => v === act.type)?.[0] || '其他';
    setEditForm({
      time: act.time || '',
      title: act.title || '',
      description: act.description || '',
      type: typeLabel
    });
    setEditingAct({ dayIdx, actIdx });
  };

  // ---------- 保存编辑 ----------
  const handleSaveEdit = () => {
    if (!editingAct) return;
    const { dayIdx, actIdx } = editingAct;
    const newTrip = { ...trip, itinerary: trip.itinerary.map((d, di) => {
      if (di !== dayIdx) return d;
      return {
        ...d,
        activities: d.activities.map((a, ai) => {
          if (ai !== actIdx) return a;
          return {
            ...a,
            time: editForm.time,
            title: editForm.title || a.title,
            description: editForm.description,
            type: typeMap[editForm.type] || 'other'
          };
        })
      };
    })};
    persistTrip(newTrip);
    setEditingAct(null);
    Taro.showToast({ title: '已保存', icon: 'success' });
  };

  // ---------- 重新搜索替代方案 ----------
  const handleReselect = (dayIdx: number, actIdx: number) => {
    const act = trip.itinerary[dayIdx].activities[actIdx];
    if (!act || !act.title) {
      Taro.showToast({ title: '请先填写活动名称', icon: 'none' });
      return;
    }
    // 保存当前行程引用到 storage，供聊天页替换时定位
    Taro.setStorageSync('current_trip', JSON.stringify(trip));
    // 跳转聊天页，携带重搜参数
    Taro.navigateTo({
      url: `/pages/chat/index?reselectAct=${encodeURIComponent(JSON.stringify({
        tripId: trip.id,
        dayIdx,
        actIdx,
        originalTitle: act.title,
        destination: trip.destination || '',
        actType: act.type || ''
      }))}`
    });
  };
  const handleAdopt = () => {
    Taro.showModal({
      title: '添加到我的行程',
      content: '确定要将此行程添加到我的行程吗？',
      success: (res) => {
        if (res.confirm) {
          saveTrip(trip);
          Taro.showToast({ title: '已添加到我的行程', icon: 'success' });
          setTimeout(() => Taro.switchTab({ url: '/pages/trips/index' }), 1000);
        }
      }
    });
  };

  const handleSyncCalendar = () => {
    Taro.showModal({
      title: '同步到日历',
      content: '确定将所有行程同步到日历吗？',
      success: (res) => {
        if (res.confirm) {
          syncCalendar(trip);
        }
      }
    });
  };

  const renderActivityTypes = () =>
    activityTypes.map(t => (
      <View key={t}
        className={editForm.type === t ? styles.typeChipActive : styles.typeChip}
        onClick={() => setEditForm({ ...editForm, type: t })}
      >
        <Text>{t}</Text>
      </View>
    ));

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        {trip.image ? (
          <Image className={styles.image} src={trip.image} mode="aspectFill" />
        ) : (
          <View className={styles.imagePlaceholder}>
            <Text className={styles.imagePlaceholderText}>🏙️</Text>
          </View>
        )}
        <View className={styles.headerOverlay}>
          <Text className={styles.title}>{trip.title}</Text>
          <Text className={styles.dest}>{trip.destination}</Text>
        </View>
      </View>

      <View className={styles.infoBar}>
        <Text className={styles.infoText}>
          📅 {formatDateCN(trip.startDate)} - {formatDateCN(trip.endDate)} · {trip.days}天
        </Text>
      </View>

      <View className={styles.section}>
        <Text className={styles.sectionTitle}>每日行程</Text>
        {trip.itinerary.map((day, dayIdx) => (
          <View key={day.day} className={styles.dayCard}>
            <View className={styles.dayHeader}>
              <View className={styles.dayBadge}>
                <Text className={styles.dayBadgeText}>第{day.day}天</Text>
              </View>
              <Text className={styles.dateLabel}>{day.date}</Text>
            </View>

            <View className={styles.activities}>
              {day.activities.map((act, actIdx) => (
                <View key={act.id} className={styles.actItem}>
                  {editingAct?.dayIdx === dayIdx && editingAct?.actIdx === actIdx ? (
                    /* 编辑模式 */
                    <View className={styles.editCard}>
                      <View className={styles.editRow}>
                        <Text className={styles.editLabel}>时间</Text>
                        <Input className={styles.editInput}
                          value={editForm.time}
                          placeholder="例: 09:00-12:00"
                          onInput={e => setEditForm({ ...editForm, time: e.detail.value })}
                        />
                      </View>
                      <View className={styles.editRow}>
                        <Text className={styles.editLabel}>名称</Text>
                        <Input className={styles.editInput}
                          value={editForm.title}
                          placeholder="活动名称"
                          onInput={e => setEditForm({ ...editForm, title: e.detail.value })}
                        />
                      </View>
                      <View className={styles.editRow}>
                        <Text className={styles.editLabel}>描述</Text>
                        <Input className={styles.editInput}
                          value={editForm.description}
                          placeholder="备注描述"
                          onInput={e => setEditForm({ ...editForm, description: e.detail.value })}
                        />
                      </View>
                      <View className={styles.editRow}>
                        <Text className={styles.editLabel}>类型</Text>
                        <View className={styles.typeRow}>{renderActivityTypes()}</View>
                      </View>
                      <View className={styles.editActions}>
                        <View className={styles.cancelBtn} onClick={() => setEditingAct(null)}>
                          <Text>取消</Text>
                        </View>
                        <View className={styles.saveBtn} onClick={handleSaveEdit}>
                          <Text>💾 保存</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    /* 展示模式 */
                    <>
                      {act.image && isPicsumEnabled() ? (
                        <Image className={styles.actThumb} src={act.image} mode="aspectFill" />
                      ) : (
                        <Image className={styles.actThumb} src={resolveDestImage(trip.destination)} mode="aspectFill" />
                      )}
                      <View className={styles.actLine}>
                        <View className={styles.actDot} />
                        <Text className={styles.actTime}>{act.time || '待定'}</Text>
                        <Text className={styles.actTitle}>{act.title || '未命名'}</Text>
                      </View>
                      {act.description ? <Text className={styles.actDesc}>{act.description}</Text> : null}
                      {act.jumpUrl ? (
                         <View className={styles.actDetailLink} onClick={() => handleLinkClick(act.jumpUrl!)}>
                           <Text className={styles.actDetailLinkText}>🔗 查看详情</Text>
                         </View>
                       ) : null}
                      <View className={styles.actActions}>
                        <View className={styles.editBtn} onClick={() => handleStartEdit(dayIdx, actIdx)}>
                          <Text>✏️ 编辑</Text>
                        </View>
                        <View className={styles.replaceBtn} onClick={() => handleReselect(dayIdx, actIdx)}>
                          <Text>🔄 替换</Text>
                        </View>
                        <View className={styles.delBtn} onClick={() => handleDeleteAct(dayIdx, actIdx)}>
                          <Text>🗑 删除</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>

            <View className={styles.addActBtn} onClick={() => handleAddAct(dayIdx)}>
              <Text>+ 添加活动</Text>
            </View>
          </View>
        ))}
      </View>

      <View className={styles.bottomBar}>
        {from === 'trips' ? (
          <View className={styles.adoptBtn} onClick={handleSyncCalendar}>
            <Text className={styles.adoptBtnText}>📋 同步到日历</Text>
          </View>
        ) : (
          <View className={styles.adoptBtn} onClick={handleAdopt}>
            <Text className={styles.adoptBtnText}>📋 添加到行程</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default TripDetailPage;
