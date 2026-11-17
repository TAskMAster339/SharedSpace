import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { getFilePreviewUrl } from '../../api/files';
import { useAuthStore } from '../../store/authStore';
import { FileIcon } from './FileIcon';

interface FilePreviewProps {
  fileId: string;
  type: string;
  size?: number;
  className?: string;
  fill?: boolean;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  fileId,
  type,
  size = 20,
  className,
  fill = false,
}) => {
  const token = useAuthStore((state) => state.accessToken);
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const media = type === 'img' || type === 'video';

  useEffect(() => {
    const element = ref.current;
    if (!media || !element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [media]);

  useEffect(() => {
    setUrl(null);
    if (!media || !visible || !token) return;
    let active = true;
    getFilePreviewUrl(token, fileId)
      .then((result) => {
        if (active) setUrl(result.url);
      })
      .catch(() => {
        /* Keep the file icon for unsupported or damaged media. */
      });
    return () => {
      active = false;
    };
  }, [fileId, media, visible, token]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden rounded-theme ${fill ? 'w-full h-full' : ''} ${url ? 'bg-theme-secondary' : ''}`}
      style={fill ? undefined : { width: size, height: size }}
    >
      {url ? (
        <>
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="w-full h-full object-contain"
            onError={() => setUrl(null)}
          />
          {type === 'video' && (
            <span
              role="img"
              aria-label="Видео"
              className="absolute bottom-1 right-1 flex items-center justify-center p-1 rounded-theme bg-black/60 text-white pointer-events-none"
            >
              <Play size={12} fill="currentColor" aria-hidden="true" />
            </span>
          )}
        </>
      ) : (
        <FileIcon type={type} size={size} className={className} />
      )}
    </span>
  );
};
