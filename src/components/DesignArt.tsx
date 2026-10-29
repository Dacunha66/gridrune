// Pictures of the board and page designs: the untouched picture, positioned with the stored zoom and offset.
import { CSSProperties } from 'react';
import { imageUrl } from '../game/catalog';
import { Design, ImageFit, fitStyle } from '../game/designs';

/** The picture covering its (positioned) parent; never catches taps. */
export function DesignImage({ src, fit, className = '' }: { src: string; fit: ImageFit; className?: string }) {
  const f = fitStyle(fit);
  const style: CSSProperties = { objectPosition: f.objectPosition, transform: f.transform, transformOrigin: f.transformOrigin };
  // A picture that cannot be loaded is simply left out (the normal background shows).
  return <img className={`design-img ${className}`} src={src} alt="" draggable={false} style={style} onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
}

/** Picture under the 4×4 grid (first child of .board). */
export function BoardArt({ design }: { design: Design | null }) {
  const src = design ? imageUrl(design.displayId) : undefined;
  if (!design || !src) return null;
  return (
    <div className="board-art" aria-hidden="true">
      <DesignImage src={src} fit={design.fit} />
    </div>
  );
}

/** Page background behind every screen, darkened so texts stay readable. */
export function PageArt({ design }: { design: Design | null }) {
  const src = design ? imageUrl(design.displayId) : undefined;
  if (!design || !src) return null;
  return (
    <div className="page-art" aria-hidden="true">
      <DesignImage src={src} fit={design.fit} />
      <div className="page-dim" style={{ opacity: design.page.dim }} />
    </div>
  );
}
