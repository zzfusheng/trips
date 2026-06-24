import destDali from '@/static/dest-dali.jpg';
import destSanya from '@/static/dest-sanya.jpg';
import destChengdu from '@/static/dest-chengdu.jpg';
import destXiamen from '@/static/dest-xiamen.jpg';
import destXian from '@/static/dest-xian.jpg';
import destHangzhou from '@/static/dest-hangzhou.jpg';
import destChongqing from '@/static/dest-chongqing.jpg';
import destLijiang from '@/static/dest-lijiang.jpg';
import placeholderDest from '@/static/placeholder-dest.jpg';

/** 精确名称 → 本地图（8 个城市有专属图） */
const nameMap: Record<string, string> = {
  '大理': destDali,
  '三亚': destSanya,
  '成都': destChengdu,
  '厦门': destXiamen,
  '西安': destXian,
  '杭州': destHangzhou,
  '重庆': destChongqing,
  '丽江': destLijiang,
};

/** 读取开关：是否使用在线图 */
export function isPicsumEnabled(): boolean {
  try {
    const v = (typeof Taro !== 'undefined' && Taro.getStorageSync) ? Taro.getStorageSync('use_picsum_images') : '';
    if (v === '' || v === undefined || v === null) return true; // 默认在线
    return !!v;
  } catch {
    return true;
  }
}

/** 在线城市图源（后端代理：Pexels 真实照片 → Picsum 兜底） */
function onlineCityImageUrl(name: string): string {
  return `https://www.zzfusheng.top/api/ai/city-image?name=${encodeURIComponent(name)}`;
}

/**
 * 根据目的地名称获取图片。
 * - 开关 ON  → 后端代理（Pexels 真图 / Picsum 兜底）
 * - 开关 OFF → 本地图（8 城专属 + 通用占位）
 */
export function resolveDestImage(name: string): string {
  if (!name) return placeholderDest;
  if (isPicsumEnabled()) {
    return onlineCityImageUrl(name);
  }
  return nameMap[name] || placeholderDest;
}

/** 获取本地降级图（ON 时图片加载失败用） */
export function getLocalFallback(name: string): string {
  return nameMap[name] || placeholderDest;
}
