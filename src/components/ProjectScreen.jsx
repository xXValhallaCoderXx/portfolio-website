export function isPortraitScreen(project, screen) {
  return screen?.orientation ? screen.orientation === 'portrait' : !!project.image?.tall;
}

/** A shared terminal frame for project screenshots and feature-tour highlights. */
export default function ProjectScreen({ project, screen, highlight = null, onOpen }) {
  if (!screen) return null;

  const preview = (
    <>
      <img src={screen.src} alt={screen.alt} loading="lazy" decoding="async" />
      {highlight && (
        <span
          className="screen-highlight"
          aria-hidden="true"
          style={{
            left: `${highlight.left}%`,
            top: `${highlight.top}%`,
            width: `${highlight.width}%`,
            height: `${highlight.height}%`,
          }}
        />
      )}
    </>
  );

  return (
    <div className={`project-screen${isPortraitScreen(project, screen) ? ' portrait' : ''}`}>
      <div className="screen-chrome">
        <span className="screen-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="screen-title">
          {project.title} — {screen.title}
        </span>
        {screen.placeholder && <span className="screen-placeholder">preview image</span>}
        {onOpen && (
          <button type="button" className="link screen-enlarge" onClick={onOpen} aria-label={`Enlarge ${screen.title}`}>
            [ ⤢ enlarge ]
          </button>
        )}
      </div>
      <div className="screen-image">
        {onOpen ? (
          <button
            type="button"
            className="screen-image-trigger"
            onClick={onOpen}
            aria-label={`Open ${screen.title} in the screen gallery`}
          >
            {preview}
          </button>
        ) : (
          preview
        )}
      </div>
    </div>
  );
}
