import { useEffect, useState, type ImgHTMLAttributes } from 'react';

const FALLBACK = '/assets/placeholder-food.svg';

export function ImageWithFallback({ src, alt, loading = 'lazy', decoding = 'async', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [current, setCurrent] = useState(src || FALLBACK);
  useEffect(()=>setCurrent(src || FALLBACK),[src]);
  return <img {...props} loading={loading} decoding={decoding} src={current} alt={alt || 'Imagem do produto'} onError={() => setCurrent(FALLBACK)} />;
}
