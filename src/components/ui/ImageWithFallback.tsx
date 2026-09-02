import { useEffect, useState, type ImgHTMLAttributes } from 'react';

const FALLBACK = '/assets/placeholder-flower.svg';

export function ImageWithFallback({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [current, setCurrent] = useState(src || FALLBACK);
  useEffect(()=>setCurrent(src || FALLBACK),[src]);
  return <img {...props} src={current} alt={alt || 'Imagem do produto'} onError={() => setCurrent(FALLBACK)} />;
}
