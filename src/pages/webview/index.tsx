import React from 'react';
import { WebView } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';

const WebViewPage: React.FC = () => {
  const { params } = useRouter();
  const rawUrl = decodeURIComponent(params.url || '');
  // 通过本域代理加载，绕过业务域名白名单限制
  const proxyUrl = rawUrl
    ? `https://www.zzfusheng.top/api/proxy-page?url=${encodeURIComponent(rawUrl)}`
    : '';

  if (!rawUrl) {
    Taro.showToast({ title: '链接无效', icon: 'none' });
    setTimeout(() => Taro.navigateBack(), 1000);
    return null;
  }

  return (
    <WebView
      src={proxyUrl}
      onError={() => {
        Taro.showToast({ title: '页面加载失败', icon: 'none' });
      }}
    />
  );
};

export default WebViewPage;
