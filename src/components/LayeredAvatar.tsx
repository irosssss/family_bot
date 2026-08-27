import React, { useEffect, useRef } from 'react';
import { EmotionType } from '../utils/rpg32bitCatalog';

export type AvatarLayerType =
  | 'shadow' | 'back' | 'legs' | 'body' | 'arms'
  | 'shirt' | 'pants' | 'shoes' | 'mount' | 'head'
  | 'face' | 'back_hair' | 'front_hair' | 'hat' | 'shield'
  | 'back_weapon' | 'front_weapon' | 'effect'
  | 'pet' | 'armor' | 'helmet' | 'weapon' | 'background';

export interface AvatarLayer {
  url: string;
  zIndex: number;
  type?: AvatarLayerType;
  emotion?: EmotionType;
  opacity?: number;
  frame?: { frameW: number; frameH: number };
  framePos?: { col: number; row: number };
  scale?: number;
  offsetY?: number;
  offsetX?: number;
}

export interface LayeredAvatarProps {
  layers: AvatarLayer[];
  size?: number;
  className?: string;
  animated?: boolean;
  showShadow?: boolean;
}

const LPC_FRAME = { frameW: 64, frameH: 64 };

function detectFrame(imgW: number, imgH: number): { frameW: number; frameH: number } {
  if (imgW % 64 === 0 && imgH % 64 === 0) return LPC_FRAME;
  return { frameW: imgW, frameH: imgH };
}

function drawEmotion(
  ctx: CanvasRenderingContext2D,
  emotion: EmotionType,
  canvasW: number,
  canvasH: number,
  size: number
) {
  const px = Math.max(2, Math.floor(size / 32));
  const cx = canvasW / 2;
  const faceY = canvasH * 0.30;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1a1a2e';

  const eyeDx = size * 0.10;
  const eyeY = faceY;
  const eyeW = px * 2;
  const eyeH = px * 3;

  ctx.fillRect(cx - eyeDx - eyeW / 2, eyeY, eyeW, eyeH);
  ctx.fillRect(cx + eyeDx - eyeW / 2, eyeY, eyeW, eyeH);

  if (emotion === 'sad') {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(cx - eyeDx - eyeW / 2 - px, eyeY - px * 2, eyeW + px * 2, px);
    ctx.fillRect(cx + eyeDx - eyeW / 2 - px, eyeY + px * 2, eyeW + px * 2, px);
  } else if (emotion === 'excited') {
    ctx.fillRect(cx - eyeDx - eyeW / 2 - px, eyeY - px * 2, eyeW + px * 2, px);
    ctx.fillRect(cx + eyeDx - eyeW / 2 - px, eyeY - px * 2, eyeW + px * 2, px);
  }

  const mouthY = faceY + size * 0.08;
  const mouthW = size * 0.10;
  switch (emotion) {
    case 'happy':
    case 'excited':
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cx - mouthW / 2, mouthY - px, mouthW, px);
      ctx.fillRect(cx - mouthW / 2 - px, mouthY - px * 2, px, px);
      ctx.fillRect(cx + mouthW / 2, mouthY - px * 2, px, px);
      break;
    case 'sad':
      ctx.fillStyle = '#8e44ad';
      ctx.fillRect(cx - mouthW / 2, mouthY + px, mouthW, px);
      ctx.fillRect(cx - mouthW / 2 - px, mouthY + px * 2, px, px);
      ctx.fillRect(cx + mouthW / 2, mouthY + px * 2, px, px);
      break;
    case 'tired':
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(cx - mouthW / 2, mouthY, mouthW, px);
      break;
    default:
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(cx - mouthW / 2, mouthY, mouthW, px);
  }

  ctx.restore();
}

export const LayeredAvatar: React.FC<LayeredAvatarProps> = ({
  layers,
  size = 128,
  className = '',
  animated = false,
  showShadow = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    const loadImages = async () => {
      const loadedImages = await Promise.all(
        sortedLayers.map((layer) => {
          return new Promise<{ img: HTMLImageElement; layer: AvatarLayer } | null>((resolve) => {
            if (!layer.url) {
              if (layer.type === 'face' && layer.emotion) {
                const img = new Image();
                (img as any)._programmatic = true;
                resolve({ img, layer });
              } else {
                resolve(null);
              }
              return;
            }
            const img = new Image();
            if (layer.url.startsWith('http://') || layer.url.startsWith('https://')) {
              if (!layer.url.includes(window.location.host)) {
                img.crossOrigin = 'anonymous';
              }
            }
            img.onload = () => resolve({ img, layer });
            img.onerror = (err) => {
              console.warn('LayeredAvatar: Failed to load layer image:', layer.url, err);
              resolve(null);
            };
            img.src = layer.url;
          });
        })
      );

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (showShadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(
          canvas.width / 2,
          canvas.height - size * 0.06,
          size * 0.34,
          size * 0.055,
          0, 0, Math.PI * 2
        );
        ctx.fill();
      }

      loadedImages.forEach((item) => {
        if (item && item.img) {
          const { layer } = item;
          const img = item.img;

          if ((img as any)._programmatic) {
            if (layer.type === 'face' && layer.emotion && layer.emotion !== 'neutral') {
              drawEmotion(ctx, layer.emotion, canvas.width, canvas.height, size);
            }
            return;
          }

          const frame = layer.frame ?? detectFrame(img.naturalWidth || img.width, img.naturalHeight || img.height);
          const frameW = frame.frameW;
          const frameH = frame.frameH;

          const { col = 0, row = 2 } = layer.framePos ?? {};

          const scale = layer.scale ?? 1;
          const drawW = (canvas.width * scale);
          const drawH = (canvas.height * scale);

          const offX = layer.offsetX ?? 0;
          const offY = layer.offsetY ?? 0;
          const drawX = (canvas.width - drawW) / 2 + (offX / 100) * canvas.width;
          const drawY = (canvas.height - drawH) + (offY / 100) * canvas.height;

          ctx.globalAlpha = layer.opacity ?? 1;

          const isWhole = frameW >= img.naturalWidth && frameH >= img.naturalHeight;
          if (isWhole) {
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
          } else {
            const sx = col * frameW;
            const sy = row * frameH;
            ctx.drawImage(img, sx, sy, frameW, frameH, drawX, drawY, drawW, drawH);
          }

          ctx.globalAlpha = 1;
        }
      });
    };

    loadImages();
  }, [layers, size, showShadow]);

  const animClass = animated ? 'animate-pixel-idle' : '';

  return (
    <div className={`relative inline-flex items-center justify-center ${animClass} ${className}`}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="pixel-art"
        style={{
          imageRendering: 'pixelated',
          width: size,
          height: size,
        }}
      />
    </div>
  );
};

export default LayeredAvatar;
