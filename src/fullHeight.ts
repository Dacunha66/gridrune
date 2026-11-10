// iPhone home-screen app: with the translucent status bar some iOS versions make the page as tall as the screen MINUS the
// status bar, so a dark empty strip remains at the bottom. Then the page is stretched to the full screen height.
// Only when the missing piece is exactly the status bar (never in Safari, in iPad windows or in landscape).
export function fixStandaloneHeight(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  if (!standalone) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const root = document.documentElement;
  const update = () => {
    root.style.removeProperty('--app-h');
    const top = probe.getBoundingClientRect().height;
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const screenH = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const pageH = Math.min(window.innerHeight, root.getBoundingClientRect().height);
    const gap = screenH - pageH;
    if (top > 0 && gap > 1 && Math.abs(gap - top) <= 2) root.style.setProperty('--app-h', `${screenH}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 300));
}
