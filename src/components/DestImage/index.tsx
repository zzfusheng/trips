import React, { useState, useCallback } from 'react';
import { Image } from '@tarojs/components';
import { resolveDestImage, getLocalFallback } from '@/utils/destImage';

interface DestImageProps {
  name: string;
  className: string;
  mode?: 'aspectFill' | 'aspectFit' | 'widthFix' | 'scaleToFill';
  style?: React.CSSProperties;
}

/**
 * 目的地图片组件：在线图源 + onError 自动降级本地
 */
const DestImage: React.FC<DestImageProps> = ({ name, className, mode = 'aspectFill', style }) => {
  const [failed, setFailed] = useState(false);

  const onError = useCallback(() => {
    setFailed(true);
  }, []);

  const src = failed ? getLocalFallback(name) : resolveDestImage(name);

  return <Image className={className} src={src} mode={mode} style={style} onError={onError} />;
};

export default DestImage;
