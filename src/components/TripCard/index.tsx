import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import { TripPlan } from '@/types/trip';
import { formatDateCN } from '@/utils/format';
import DestImage from '@/components/DestImage';
import { downloadTripPoster } from '@/utils/poster';

interface TripCardProps {
  trip: TripPlan;
  onCheckIn?: (tripId: string, checkedIn: boolean) => void;
}

const TripCard: React.FC<TripCardProps> = ({ trip, onCheckIn }) => {
  const getToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getStatus = (): { label: string; className: string } | null => {
    const today = getToday();
    if (trip.startDate <= today && trip.endDate >= today) return { label: '进行中', className: 'active' };
    if (trip.endDate < today) return { label: '已完成', className: 'done' };
    return null;
  };

  const status = getStatus();
  const checkedIn = !!trip.checkedIn;

  const handleClick = () => {
    Taro.navigateTo({
      url: `/pages/tripDetail/index?id=${trip.id}&from=trips`
    });
  };

  const handleCheckToggle = (e: any) => {
    e.stopPropagation();
    onCheckIn?.(trip.id, !checkedIn);
  };

  const handleDownload = (e: any) => {
    e.stopPropagation();
    downloadTripPoster(trip);
  };

  return (
    <View className={styles.card} onClick={handleClick}>
      <View className={styles.imageWrap}>
        <DestImage
          className={styles.image}
          name={trip.destination}
          mode="aspectFill"
        />
        <View className={styles.topBadges}>
          <View className={styles.downloadBtn} onClick={handleDownload}>
            <Text className={styles.downloadBtnIcon}>↓</Text>
          </View>
          {status && (
            <View className={classnames(styles.badge, styles[`badge${status.className}`])}>
              <Text className={styles.badgeText}>{status.label}</Text>
            </View>
          )}
        </View>
      </View>
      <View className={styles.body}>
        <View className={styles.header}>
          <Text className={styles.title}>{trip.title}</Text>
          <View className={styles.tags}>
            {trip.tags.slice(0, 2).map((tag, i) => (
              <View key={i} className={styles.tag}>
                <Text className={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text className={styles.desc}>{trip.description}</Text>
        <View className={styles.footer}>
          <View className={styles.dateBox}>
            <Text className={styles.dateIcon}>📅</Text>
            <Text className={styles.dateText}>
              {formatDateCN(trip.startDate)} - {formatDateCN(trip.endDate)}
            </Text>
          </View>
          <View className={styles.footerRight}>
            <View
              className={classnames(styles.checkBtn, checkedIn && styles.checkBtnDone)}
              onClick={handleCheckToggle}
            >
              <Text className={styles.checkBtnText}>
                {checkedIn ? '✓ 已打卡' : '○ 未打卡'}
              </Text>
            </View>
            <View className={styles.days}>
              <Text className={styles.daysText}>{trip.days}天</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default TripCard;
