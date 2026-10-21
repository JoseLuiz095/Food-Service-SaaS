import type { ImgHTMLAttributes } from 'react';
import { ImageWithFallback } from './ui/ImageWithFallback';
import { useStore } from '../contexts/StoreContext';
import { getBusinessSegment } from '../segments/businessSegments';

const PLACEHOLDERS = new Set([
  '',
  '/assets/placeholder-food.svg',
]);

export function hasProductImage(src?: string, imageCount?: number) {
  if (imageCount && imageCount > 0) return true;
  return Boolean(src && !PLACEHOLDERS.has(src));
}

export function ProductMedia({
  src,
  emoji,
  imageCount,
  alt,
  className = '',
  emojiClassName = '',
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  emoji?: string;
  imageCount?: number;
  emojiClassName?: string;
}) {
  const {settings} = useStore();
  const neutral = getBusinessSegment(settings.visualTheme).id !== 'food' && settings.visualTheme.preset !== 'doce_lua';
  if (!hasProductImage(src, imageCount) && emoji?.trim()) {
    return <span className={`product-emoji-visual ${emojiClassName || className}`.trim()} role="img" aria-label={alt || 'Produto'}>{emoji.trim()}</span>;
  }

  return <ImageWithFallback src={neutral&&!hasProductImage(src,imageCount)?'/assets/placeholder-catalog.svg':src} fallbackSrc={neutral?'/assets/placeholder-catalog.svg':undefined} alt={alt || ''} className={className} {...props}/>;
}
