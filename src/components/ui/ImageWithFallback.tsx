import { useEffect, useState, type ImgHTMLAttributes } from 'react';

const FALLBACK = '/assets/placeholder-food.svg';

export function ImageWithFallback({ src, alt, loading = 'lazy', decoding = 'async', fallbackSrc = FALLBACK, ...props }: ImgHTMLAttributes<HTMLImageElement> & {fallbackSrc?:string}) {
  const [current, setCurrent] = useState(src || fallbackSrc);
  useEffect(()=>setCurrent(src || fallbackSrc),[src,fallbackSrc]);
  return <img {...props} loading={loading} decoding={decoding} src={current} alt={alt || 'Imagem do produto'} onError={() => setCurrent(fallbackSrc)} />;
}
