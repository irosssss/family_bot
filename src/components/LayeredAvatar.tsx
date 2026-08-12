import React, { useEffect, useRef } from 'react';

export interface AvatarLayer {
  url: string;
  zIndex: number;
  type?: 'pet' | 'body' | 'armor' | 'helmet' | 'weapon' | 'background';
}

export interface LayeredAvatarProps {
  layers: AvatarLayer[];
  size?: number;
  className?: string;
  animated?: boolean;
}

export const LayeredAvatar: React.FC<LayeredAvatarProps> = ({ 
  layers, 
  size = 128, 
  className = '',
  animated = false 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false; // Preserve 32-bit pixel art crispness

    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    const loadImages = async () => {
      const loadedImages = await Promise.all(
        sortedLayers.map((layer) => {
          return new Promise<{ img: HTMLImageElement; layer: AvatarLayer } | null>((resolve) => {
            if (!layer.url) {
              resolve(null);
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
      
      let drawnCount = 0;
      loadedImages.forEach((item) => {
        if (item && item.img) {
          ctx.drawImage(item.img, 0, 0, canvas.width, canvas.height);
          drawnCount++;
        }
      });
    };

    loadImages();
  }, [layers, size]);

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

