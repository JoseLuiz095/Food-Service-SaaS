import type { ImgHTMLAttributes } from 'react';
import { ImageWithFallback } from './ui/ImageWithFallback';

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
  if (!hasProductImage(src, imageCount) && emoji?.trim()) {
    return <span className={`product-emoji-visual ${emojiClassName || className}`.trim()} role="img" aria-label={alt || 'Produto'}>{emoji.trim()}</span>;
  }

  return <ImageWithFallback src={src} alt={alt || ''} className={className} {...props}/>;
}
