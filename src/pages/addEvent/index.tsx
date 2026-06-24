import React, { useState, useEffect } from 'react';
import { View, Text, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import { CalendarEvent } from '@/types/trip';
import { addCalendarEvent, fetchCalendarEvents, upsertCalendarEvent } from '@/services/cloud';

const EVENT_TYPES = [
  { key: 'sightseeing', label: '景点' },
  { key: 'food', label: '美食' },
  { key: 'transport', label: '交通' },
  { key: 'hotel', label: '住宿' },
  { key: 'other', label: '其他' }
];

const REMIND_OPTIONS = [
  { value: 0, label: '不提醒' }
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const AddEventPage: React.FC = () => {
  // 日期：Picker date 模式
  const today = new Date();
  const initDate = Taro.getStorageSync('add_event_date') || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(initDate);
  const [dateDisplay, setDateDisplay] = useState('');

  // 时间：Picker time 模式
  const [time, setTime] = useState('09:00');
  const [timeDisplay, setTimeDisplay] = useState('09:00');

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState('other');
  const [reminder, setReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState(5);

  useEffect(() => {
    // 格式化日期显示
    const d = new Date(date);
    const weekDay = WEEKDAYS[d.getDay()];
    setDateDisplay(`${d.getMonth() + 1}月${d.getDate()}日 周${weekDay}`);
  }, [date]);

  const handleDateChange = (e: any) => {
    setDate(e.detail.value);
  };

  const handleTimeChange = (e: any) => {
    setTime(e.detail.value);
    setTimeDisplay(e.detail.value);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: '请输入活动名称', icon: 'none' });
      return;
    }
    if (!date) {
      Taro.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    if (!time) {
      Taro.showToast({ title: '请选择时间', icon: 'none' });
      return;
    }

    // 校验同日期同时间段是否有冲突
    let hasConflict = false;
    try {
      const existing = await fetchCalendarEvents();
      const conflict = existing.find(e => e.date === date && e.time === time);
      if (conflict) {
        hasConflict = true;
        const res = await Taro.showModal({
          title: '时间冲突',
          content: `${date} ${time} 已有「${conflict.title}」，是否替换？`,
          confirmText: '替换',
          cancelText: '取消'
        });
        if (!res.confirm) return;
      }
    } catch (err) {
      console.warn('[AddEvent] 冲突检查跳过:', err);
    }

    const newEvent: CalendarEvent = {
      id: 'custom_' + Date.now(),
      title: title.trim(),
      date,
      time,
      location: location.trim(),
      description: description.trim(),
      reminder,
      reminderTime: reminder ? reminderTime : 0,
      type: eventType as CalendarEvent['type']
    };

    try {
      if (hasConflict) {
        await upsertCalendarEvent(newEvent);
      } else {
        await addCalendarEvent(newEvent);
      }
      Taro.showToast({ title: '添加成功', icon: 'success' });
      Taro.navigateBack();
    } catch (err) {
      console.error('[AddEvent] 添加失败:', err);
      Taro.showToast({ title: '添加失败', icon: 'error' });
    }
  };

  return (
    <View className={styles.page}>
      <View className={styles.form}>
        <View className={styles.field}>
          <Text className={styles.fieldLabel}>活动名称</Text>
          <Input
            className={styles.fieldInput}
            placeholder="例如：参观故宫博物院"
            value={title}
            onInput={(e) => setTitle(e.detail.value)}
          />
        </View>

        <View className={styles.pickerGroup}>
          <Picker mode="date" value={date} onChange={handleDateChange}>
            <View className={styles.pickerItem}>
              <Text className={styles.pickerLabel}>日期</Text>
              <View className={styles.pickerValueWrap}>
                <Text className={styles.pickerValue}>{dateDisplay}</Text>
                <Text className={styles.pickerArrow}>▼</Text>
              </View>
            </View>
          </Picker>
        </View>
        <View className={styles.pickerGroup}>
          <Picker mode="time" value={time} onChange={handleTimeChange}>
            <View className={styles.pickerItem}>
              <Text className={styles.pickerLabel}>开始</Text>
              <View className={styles.pickerValueWrap}>
                <Text className={styles.pickerValue}>{timeDisplay}</Text>
                <Text className={styles.pickerArrow}>▼</Text>
              </View>
            </View>
          </Picker>
        </View>

        <View className={styles.field}>
          <Text className={styles.fieldLabel}>地点</Text>
          <Input
            className={styles.fieldInput}
            placeholder="例如：北京市东城区"
            value={location}
            onInput={(e) => setLocation(e.detail.value)}
          />
        </View>

        <View className={styles.field}>
          <Text className={styles.fieldLabel}>活动类型</Text>
          <View className={styles.typeSelect}>
            {EVENT_TYPES.map(t => (
              <View
                key={t.key}
                className={classnames(styles.typeItem, eventType === t.key && styles.typeItemActive)}
                onClick={() => setEventType(t.key)}
              >
                <Text className={classnames(styles.typeItemText, eventType === t.key && styles.typeItemTextActive)}>
                  {t.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className={styles.field}>
          <Text className={styles.fieldLabel}>备注</Text>
          <Input
            className={styles.fieldInput}
            placeholder="添加备注信息"
            value={description}
            onInput={(e) => setDescription(e.detail.value)}
          />
        </View>

        <View className={styles.field}>
          <View className={styles.remindField}>
            <Text className={styles.remindLabel}>闹钟提醒</Text>
            <View
              className={classnames(styles.remindSwitch, reminder && styles.remindActive)}
              onClick={() => setReminder(!reminder)}
            >
              <View className={classnames(styles.remindDot, reminder && styles.remindDotActive)} />
            </View>
          </View>
      </View>

      <View className={styles.submitBtn} onClick={handleSubmit}>
          <Text className={styles.submitBtnText}>确认添加</Text>
        </View>
      </View>
    </View>
  );
};

export default AddEventPage;
