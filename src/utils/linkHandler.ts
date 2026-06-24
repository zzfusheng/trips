import Taro from '@tarojs/taro';

// 清理 flyai 返回的 URL（可能含反引号、尾随标点、markdown 语法）
const cleanUrl = (url: string): string => {
  return (url || '')
    .replace(/[`]/g, '')
    .replace(/[*_~)]+$/g, '')  // 去除尾部 markdown 标记和括号
    .trim();
};

export const handleLinkClick = (url: string) => {
  const cleaned = cleanUrl(url);
  Taro.setClipboardData({ data: cleaned });
  Taro.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'success', duration: 2000 });
};
