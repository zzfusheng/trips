import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const wx: any;
import classnames from 'classnames';
import styles from './index.module.scss';
import { CalendarEvent } from '@/types/trip';
import { fetchCalendarEvents, updateCalendarEvent, deleteCalendarEvent, getGlobalReminder } from '@/services/cloud';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const CalendarPage: React.FC = () => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  // 每次显示页面时从 storage 加载事件
  useDidShow(() => {
    loadEvents();
    syncGlobalReminder();
  });

  useEffect(() => {
    loadEvents();
    syncGlobalReminder();
  }, []);

  /** 从云端同步全局提醒开关到本地 */
  const syncGlobalReminder = async () => {
    try {
      const res: any = await Taro.cloud.callFunction({ name: 'getOpenid' });
      const id = res?.result?.openid;
      if (id) {
        const cloudVal = await getGlobalReminder(id);
        if (cloudVal !== null) {
          Taro.setStorageSync('global_reminder_enabled', cloudVal);
        }
      }
    } catch {}
  };

  const loadEvents = async () => {
    // 从云数据库加载
    const cloudEvents = await fetchCalendarEvents();
    if (cloudEvents.length > 0) {
      setEvents(cloudEvents);
    }
  };

  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  const firstDayOfMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 1).getDay();
  }, [currentYear, currentMonth]);

  const dateEvents = useMemo(() => {
    return events
      .filter(e => e.date === selectedDate)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [events, selectedDate]);

  const isToday = (day: number) => {
    const d = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return d === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  const hasEvent = (day: number) => {
    const d = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.some(e => e.date === d);
  };

  const handleSelectDate = (day: number) => {
    const d = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(d);
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleAddEvent = () => {
    // 将选中日期传给添加页
    Taro.setStorageSync('add_event_date', selectedDate);
    Taro.navigateTo({ url: '/pages/addEvent/index' });
  };

  const handleToggleReminder = async (eventId: string) => {
    const g = Taro.getStorageSync('global_reminder_enabled');
    if (g !== undefined && !g) {
      Taro.showToast({ title: '请先在设置中开启全局提醒', icon: 'none' });
      return;
    }
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const newReminder = !event.reminder;

    // 开启提醒时请求订阅消息授权（一次性订阅）
    if (newReminder) {
      const TMPL_ID = 'CRQroT2ciQQwC2CmJ9TB5_r7GmF9wvf9-zFI_G6zzlc';
      try {
        // Taro 4 中 requestSubscribeMessage 可能未适配，直接用 wx
        const res: any = await wx.requestSubscribeMessage({
          tmplIds: [TMPL_ID]
        });
        if (res.errMsg?.includes('ok') && res[TMPL_ID] === 'accept') {
          console.log('[Calendar] 订阅授权成功');
        } else {
          console.warn('[Calendar] 订阅授权结果:', res);
          Taro.showToast({ title: '需要授权才能收到提醒', icon: 'none' });
          return;
        }
      } catch (err: any) {
        console.error('[Calendar] requestSubscribeMessage 失败:', err);
        Taro.showToast({ title: '订阅消息调用失败，请稍后重试', icon: 'none' });
        return;
      }
    }

    const updated = events.map(e =>
      e.id === eventId ? { ...e, reminder: newReminder } : e
    );
    setEvents(updated);
    updateCalendarEvent(eventId, { reminder: newReminder });
    Taro.showToast({
      title: newReminder ? '已开启提醒' : '已关闭提醒',
      icon: 'none'
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    Taro.showModal({
      title: '删除确认',
      content: '确定要删除这个行程事件吗？',
      success: (res) => {
        if (res.confirm) {
          const updated = events.filter(e => e.id !== eventId);
          setEvents(updated);
          deleteCalendarEvent(eventId);
          Taro.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  };

  const getTypeStyle = (type: string) => {
    const map: Record<string, string> = {
      sightseeing: styles.typeSightseeing,
      food: styles.typeFood,
      transport: styles.typeTransport,
      hotel: styles.typeHotel,
      other: styles.typeOther
    };
    return map[type] || styles.typeOther;
  };

  const renderCalendarDays = () => {
    const days = [];
    const totalCells = firstDayOfMonth + daysInMonth;
    const rows = Math.ceil(totalCells / 7);

    for (let i = 0; i < rows * 7; i++) {
      const day = i - firstDayOfMonth + 1;
      const isValidDay = day >= 1 && day <= daysInMonth;
      const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isSelected = selectedDate === dayStr;
      const todayClass = isValidDay && isToday(day);

      days.push(
        <View
          key={i}
          className={classnames(
            styles.dayCell,
            !isValidDay && styles.dayEmpty,
            isSelected && styles.daySelected,
            todayClass && styles.dayToday
          )}
          onClick={() => isValidDay && handleSelectDate(day)}
        >
          {isValidDay && (
            <>
              <Text className={classnames(
                styles.dayText,
                isSelected && styles.dayTextSelected,
                todayClass && styles.dayTextToday
              )}>{day}</Text>
              {hasEvent(day) && (
                <View className={classnames(styles.dayDot, isSelected && styles.dayDotSelected)} />
              )}
            </>
          )}
        </View>
      );
    }
    return days;
  };

  const formatDateLabel = () => {
    const d = new Date(selectedDate);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekDay = WEEKDAYS[d.getDay()];
    return `${month}月${day}日 周${weekDay}`;
  };

  return (
    <View className={styles.page}>
      <View className={styles.calendarCard}>
        <View className={styles.monthNav}>
          <View className={styles.navBtn} onClick={handlePrevMonth}>
            <Text className={styles.navText}>‹</Text>
          </View>
          <Text className={styles.monthTitle}>{currentYear}年{currentMonth + 1}月</Text>
          <View className={styles.navBtn} onClick={handleNextMonth}>
            <Text className={styles.navText}>›</Text>
          </View>
        </View>

        <View className={styles.weekRow}>
          {WEEKDAYS.map(w => (
            <View key={w} className={styles.weekCell}>
              <Text className={styles.weekText}>{w}</Text>
            </View>
          ))}
        </View>

        <View className={styles.daysGrid}>
          {renderCalendarDays()}
        </View>
      </View>

      <View className={styles.eventSection}>
        <View className={styles.eventHeader}>
          <Text className={styles.eventTitle}>{formatDateLabel()} 的行程</Text>
          <View className={styles.eventHeaderActions}>
            {dateEvents.length > 0 && (
              <View className={styles.batchRemindBtn} onClick={() => {
                const g = Taro.getStorageSync('global_reminder_enabled');
                if (g !== undefined && !g) {
                  Taro.showToast({ title: '请先在设置中开启全局提醒', icon: 'none' });
                  return;
                }
                const allOn = dateEvents.every(e => e.reminder);
                const newVal = !allOn;
                const updated = events.map(e =>
                  e.date === selectedDate ? { ...e, reminder: newVal } : e
                );
                setEvents(updated);
                dateEvents.forEach(e => updateCalendarEvent(e.id, { reminder: newVal }));
                Taro.showToast({ title: newVal ? '已全部开启提醒' : '已全部关闭提醒', icon: 'none' });
              }}>
                <Text className={styles.batchRemindText}>
                  {dateEvents.every(e => e.reminder) ? '🔕 取消全部' : '🔔 全部提醒'}
                </Text>
              </View>
            )}
            <View className={styles.addBtn} onClick={handleAddEvent}>
              <Text className={styles.addBtnText}>+ 添加</Text>
            </View>
          </View>
        </View>

        <ScrollView scrollY className={styles.eventList}>
          {dateEvents.length > 0 ? (
            dateEvents.map(event => (
              <View key={event.id} className={styles.eventCard}>
                <View className={classnames(styles.eventDot, getTypeStyle(event.type))} />
                <View className={styles.eventInfo}>
                  <View className={styles.eventRow}>
                    <Text className={styles.eventTime}>
                      {event.time}{event.endTime ? ` - ${event.endTime}` : ''}
                    </Text>
                    <Text className={styles.eventName}>{event.title}</Text>
                  </View>
                  <Text className={styles.eventLoc}>📍 {event.location}</Text>
                  <Text className={styles.eventDesc}>{event.description}</Text>
                </View>
                <View className={styles.eventActions}>
                  <View
                    className={classnames(styles.remindBtn, event.reminder && styles.remindActive)}
                    onClick={() => handleToggleReminder(event.id)}
                  >
                    <Text className={classnames(styles.remindText, event.reminder && styles.remindActiveText)}>
                      {event.reminder ? '🔔' : '🔕'}
                    </Text>
                  </View>
                  <View
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteEvent(event.id)}
                  >
                    <Text className={styles.deleteText}>🗑️</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View className={styles.noEvent}>
              <Text className={styles.noEventIcon}>📭</Text>
              <Text className={styles.noEventText}>当天暂无安排</Text>
              <View className={styles.noEventBtn} onClick={handleAddEvent}>
                <Text className={styles.noEventBtnText}>手动添加行程</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

export default CalendarPage;
