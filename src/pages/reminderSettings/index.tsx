import React, { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import { setGlobalReminder } from '@/services/cloud';

const ReminderSettingsPage: React.FC = () => {
  const [globalOn, setGlobalOn] = useState(true);
  const [openid, setOpenid] = useState('');

  useEffect(() => {
    Taro.cloud.callFunction({ name: 'getOpenid' }).then((res: any) => {
      const id = res?.result?.openid || '';
      setOpenid(id);
    });
    // 本地缓存优先，快速渲染
    try {
      const v = Taro.getStorageSync('global_reminder_enabled');
      if (v !== undefined) setGlobalOn(!!v);
    } catch {}
  }, []);

  const handleToggle = async () => {
    const newVal = !globalOn;
    setGlobalOn(newVal);
    Taro.setStorageSync('global_reminder_enabled', newVal);
    // 同步到云端
    if (openid) {
      setGlobalReminder(openid, newVal);
    }
    Taro.showToast({
      title: newVal ? '全局提醒已开启' : '全局提醒已关闭',
      icon: 'none'
    });
  };

  return (
    <View className={styles.page}>
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>全局设置</Text>
        <View className={styles.row}>
          <View>
            <Text className={styles.rowLabel}>行程提醒</Text>
            <Text className={styles.rowDesc}>
              关闭后，所有日历行程将不再显示提醒开关
            </Text>
          </View>
          <View
            className={classnames(styles.switch, globalOn && styles.active)}
            onClick={handleToggle}
          >
            <View className={classnames(styles.switchDot, globalOn && styles.active)} />
          </View>
        </View>
      </View>

      <Text className={styles.tip}>
        提醒设置仅控制是否在日历中显示提醒选项。{'\n'}
        开启后，您可以在日历中为每个行程单独设置闹钟提醒。
      </Text>
    </View>
  );
};

export default ReminderSettingsPage;
