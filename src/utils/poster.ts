import Taro from '@tarojs/taro';
import { resolveDestImage } from './destImage';
import type { TripPlan } from '@/types/trip';

const CANVAS_ID = 'trip-poster-canvas';
const W = 375;
const PAD = 20;
const HEADER_H = 200;

/** 预计算海报高度 */
function calcHeight(trip: TripPlan): number {
  let y = HEADER_H + 28;  // 标题
  y += 26;                 // 目的地
  y += 24;                 // 日期
  y += 18;                 // 分割线
  y += 44;                 // “行程概览”标题
  (trip.itinerary || []).forEach(day => {
    y += 20;               // Day N
    (day.activities || []).forEach(() => { y += 18; });
    y += 4;                // 天间距
  });
  return Math.max(y + 30, 600); // 至少 600
}

/** 生成行程海报并保存到相册 */
export async function downloadTripPoster(trip: TripPlan): Promise<void> {
  Taro.showLoading({ title: '生成海报中...' });

  try {
    const ctx = Taro.createCanvasContext(CANVAS_ID);
    const H = calcHeight(trip);

    // 1. 城市头图
    const cityImg = resolveDestImage(trip.destination);
    ctx.drawImage(cityImg, 0, 0, W, HEADER_H);

    // 2. 头图渐变遮罩
    const maskGrad = ctx.createLinearGradient(0, HEADER_H - 60, 0, HEADER_H);
    maskGrad.addColorStop(0, 'rgba(10,10,26,0)');
    maskGrad.addColorStop(1, '#0a0a1a');
    ctx.setFillStyle(maskGrad);
    ctx.fillRect(0, HEADER_H - 60, W, 60);

    // 3. 炫光条
    const glowGrad = ctx.createLinearGradient(0, HEADER_H - 4, 0, HEADER_H);
    glowGrad.addColorStop(0, 'rgba(102,126,234,0)');
    glowGrad.addColorStop(0.5, '#667eea');
    glowGrad.addColorStop(1, 'rgba(118,75,162,0)');
    ctx.setFillStyle(glowGrad);
    ctx.fillRect(0, HEADER_H - 4, W, 4);

    // 4. 背景底色
    ctx.setFillStyle('#0a0a1a');
    ctx.fillRect(0, HEADER_H, W, Math.max(0, H - HEADER_H));

    // 5. 标题
    let y = HEADER_H + 28;
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(18);
    ctx.fillText(truncate(trip.title, 16), PAD, y);

    // 6. 目的地
    y += 26;
    ctx.setFillStyle('#aaaacc');
    ctx.setFontSize(13);
    ctx.fillText(`📍 ${trip.destination}`, PAD, y);

    // 7. 日期 & 天数
    y += 24;
    ctx.setFillStyle('#8888aa');
    ctx.setFontSize(12);
    ctx.fillText(`📅 ${trip.startDate} ～ ${trip.endDate}  ·  ${trip.days}天`, PAD, y);

    // 8. 分割线
    y += 18;
    ctx.setStrokeStyle('rgba(255,255,255,0.12)');
    ctx.setLineWidth(1);
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();

    // 9. 行程概览
    y += 20;
    ctx.setFillStyle('#ccccdd');
    ctx.setFontSize(14);
    ctx.fillText('行程概览', PAD, y);
    y += 24;

    // 全部行程，全部活动
    (trip.itinerary || []).forEach(day => {
      ctx.setFillStyle('#ffffff');
      ctx.setFontSize(13);
      ctx.fillText(`Day${day.day}  ${day.title}`, PAD, y);
      y += 20;

      (day.activities || []).forEach(act => {
        ctx.setFillStyle('#777799');
        ctx.setFontSize(11);
        ctx.fillText(`  ${act.time || ''}  ${act.title}`, PAD + 10, y);
        y += 18;
      });
      y += 4;
    });

    // 底色补全到底部
    ctx.setFillStyle('#0a0a1a');
    ctx.fillRect(0, y, W, Math.max(0, H - y));

    // 10. 底部水印（底色之后画，确保不被覆盖）
    ctx.setFillStyle('rgba(255,255,255,0.12)');
    ctx.setFontSize(10);
    ctx.fillText('旅行规划助手 · 生成', PAD, H - 15);

    // 11. draw
    await new Promise<void>(resolve => {
      ctx.draw(false, () => resolve());
    });

    // 12. 导出（宽 750、高按内容自适应）
    const exportH = Math.ceil(H);
    const tempRes: any = await new Promise((resolve, reject) => {
      Taro.canvasToTempFilePath({
        canvasId: CANVAS_ID,
        x: 0, y: 0, width: W, height: exportH,
        destWidth: W * 2, destHeight: exportH * 2,
        success: resolve,
        fail: reject
      });
    });

    Taro.hideLoading();

    // 13. 保存
    try {
      await Taro.saveImageToPhotosAlbum({ filePath: tempRes.tempFilePath });
      Taro.showToast({ title: '已保存到相册', icon: 'success' });
    } catch {
      Taro.showModal({
        title: '需要相册权限',
        content: '请授权保存图片到相册',
        success: (modalRes: any) => {
          if (modalRes.confirm) Taro.openSetting({});
        }
      });
    }
  } catch (err) {
    Taro.hideLoading();
    console.warn('[Poster] 生成失败:', err);
    Taro.showToast({ title: '生成失败，请重试', icon: 'none' });
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
