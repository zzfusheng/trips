import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Canvas } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import TripCard from '@/components/TripCard';
import { TripPlan } from '@/types/trip';
import { sampleTripPlan } from '@/data/destinations';
import { fetchTrips, updateTripCheckIn } from '@/services/cloud';

const TripsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [trips, setTrips] = useState<TripPlan[]>([]);

  useDidShow(() => {
    loadTrips();
  });

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    const data = await fetchTrips();
    if (data.length > 0) {
      setTrips(data);
    } else {
      setTrips([sampleTripPlan]);
    }
  };

  const handleCheckIn = async (tripId: string, checkedIn: boolean) => {
    // 乐观更新
    setTrips(prev => prev.map(t => t.id === tripId ? { ...t, checkedIn } : t));
    await updateTripCheckIn(tripId, checkedIn);
  };

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'completed', label: '已完成' },
    { key: 'checked', label: '已打卡' }
  ];

  const getToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const filteredTrips = (() => {
    const today = getToday();
    if (activeTab === 'all') return trips;
    if (activeTab === 'checked') return trips.filter(t => t.checkedIn);
    return trips.filter(t => {
      if (activeTab === 'active') return t.startDate <= today && t.endDate >= today;
      if (activeTab === 'completed') return t.endDate < today;
      return false;
    });
  })();

  const handleChat = () => {
    Taro.navigateTo({ url: '/pages/chat/index' });
  };

  return (
    <View className={styles.page}>
      {trips.length > 0 ? (
        <>
          <View className={styles.tabs}>
            {tabs.map(tab => (
              <View
                key={tab.key}
                className={classnames(styles.tab, activeTab === tab.key && styles.tabActive)}
                onClick={() => setActiveTab(tab.key)}
              >
                <Text className={classnames(styles.tabText, activeTab === tab.key && styles.tabActiveText)}>
                  {tab.label}
                </Text>
              </View>
            ))}
          </View>
          <ScrollView scrollY className={styles.list}>
            {filteredTrips.map(trip => (
              <TripCard key={trip.id} trip={trip} onCheckIn={handleCheckIn} />
            ))}
          </ScrollView>
        </>
      ) : (
        <View className={styles.empty}>
          <Text className={styles.emptyIcon}>🗺️</Text>
          <Text className={styles.emptyText}>还没有行程，让AI帮你规划一个吧</Text>
          <View className={styles.emptyBtn} onClick={handleChat}>
            <Text className={styles.emptyBtnText}>开始规划行程</Text>
          </View>
        </View>
      )}
      <Canvas
        canvasId="trip-poster-canvas"
        id="trip-poster-canvas"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '375px',
          height: '2000px'
        }}
      />
    </View>
  );
};

export default TripsPage;
