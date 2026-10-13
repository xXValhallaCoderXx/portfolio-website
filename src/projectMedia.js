/** Pause portfolio players while another surface owns the visitor's attention. */
export function pauseProjectVideos(except = null) {
  if (typeof document === 'undefined') return;
  for (const video of document.querySelectorAll('video[data-project-video]')) {
    if (video !== except) video.pause();
  }
}
