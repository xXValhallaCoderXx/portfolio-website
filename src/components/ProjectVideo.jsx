import { useEffect, useRef, useState } from 'react';
import { pauseProjectVideos } from '../projectMedia.js';

/** A user-controlled portfolio video, shared by project cards and full reports. */
export default function ProjectVideo({ project }) {
  const media = project.video;
  const videoRef = useRef(null);
  const visibleRef = useRef(true);
  const [failedSource, setFailedSource] = useState(null);
  const failed = failedSource === media?.src;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    visibleRef.current = true;
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting && entry.intersectionRatio > 0;
      if (!visibleRef.current) video.pause();
    }, { threshold: [0, 0.01] });
    observer.observe(video);

    const onVisibility = () => {
      if (document.hidden) video.pause();
    };
    const onPageHide = () => video.pause();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      video.pause();
    };
  }, [media?.src, failed]);

  if (!media) return null;

  const title = media.title || `${project.title} project walkthrough`;
  const duration = media.duration ? `${media.duration}s` : null;

  return (
    <div className="project-screen project-video">
      <div className="screen-chrome">
        <span className="screen-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="screen-title">{title}</span>
        {duration && <span className="project-video-duration">{duration}</span>}
      </div>
      <div className="project-video-stage">
        {failed ? (
          <img
            className="project-video-poster"
            src={media.poster}
            alt={`${project.title} video poster`}
            width="1920"
            height="1080"
          />
        ) : (
          <video
            ref={videoRef}
            className="project-video-media"
            data-project-video
            src={media.src}
            poster={media.poster}
            width="1920"
            height="1080"
            controls
            playsInline
            preload="none"
            tabIndex={0}
            aria-label={`${title}${duration ? `, ${duration}` : ''}`}
            onPlay={(event) => {
              const video = event.currentTarget;
              if (document.hidden || !visibleRef.current) video.pause();
              else pauseProjectVideos(video);
            }}
            onError={(event) => {
              event.currentTarget.pause();
              setFailedSource(media.src);
            }}
          >
            Your browser cannot play this video. <a href={media.src}>Open the video file.</a>
          </video>
        )}
      </div>
      {failed && (
        <p className="project-video-fallback" role="status">
          Video unavailable. You can still explore the project screenshots.
        </p>
      )}
    </div>
  );
}
