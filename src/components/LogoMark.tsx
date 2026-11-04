// GridRune symbol in the Grimoire style: a stone tablet with a gold rim, the 3×3 raster engraved in it and the
// rune (a diamond with the elk rune ᛉ) glowing in cyan. Drawn as SVG so it stays sharp at every size;
// scripts/render-icons.cjs renders the same drawing to the favicon and the home-screen icon.
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="lm-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1c2"/><stop offset="0.45" stop-color="#e3b75a"/><stop offset="1" stop-color="#8a6420"/>
    </linearGradient>
    <radialGradient id="lm-stone" cx="0.38" cy="0.3" r="0.9">
      <stop offset="0" stop-color="#2a3756"/><stop offset="1" stop-color="#0d1426"/>
    </radialGradient>
    <filter id="lm-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="5" y="5" width="110" height="110" rx="16" fill="url(#lm-stone)" stroke="url(#lm-gold)" stroke-width="5"/>
  <rect x="13" y="13" width="94" height="94" rx="10" fill="none" stroke="#e3b75a" stroke-opacity="0.35" stroke-width="1.2"/>
  <g stroke="#e3b75a" stroke-opacity="0.32" stroke-width="2">
    <path d="M44.5 13v94M75.5 13v94M13 44.5h94M13 75.5h94"/>
  </g>
  <g filter="url(#lm-glow)" fill="none" stroke="#45e3cf" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M60 25L90 60 60 95 30 60z" stroke="url(#lm-gold)" stroke-width="5"/>
    <path d="M60 14v92M60 58L42 37M60 58L78 37"/>
  </g>
</svg>`;

export function LogoMark({ className = '' }: { className?: string }) {
  return <span className={`logo-mark ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />;
}
