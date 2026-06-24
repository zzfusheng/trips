import dayjs from 'dayjs';

export const formatDate = (date: string, format = 'YYYY-MM-DD') => {
  return dayjs(date).format(format);
};

export const formatDateCN = (date: string) => {
  return dayjs(date).format('YYYY年M月D日');
};

export const formatTime = (time: string) => {
  return time;
};

export const getDayLabel = (day: number) => {
  const labels = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return labels[day] || String(day);
};

export const getActivityTypeIcon = (type: string) => {
  const map: Record<string, string> = {
    sightseeing: '🎯',
    food: '🍽️',
    transport: '🚗',
    hotel: '🏨',
    other: '📌'
  };
  return map[type] || '📌';
};

export const getActivityTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    sightseeing: '景点',
    food: '美食',
    transport: '交通',
    hotel: '住宿',
    other: '其他'
  };
  return map[type] || '其他';
};
