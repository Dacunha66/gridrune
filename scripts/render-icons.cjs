// Renders the GridRune symbol (LOGO_SVG in src/components/LogoMark.tsx) to the favicon, the home-screen icon and the
// app icons of the PWA.
// Usage: node scripts/render-icons.cjs   (needs Playwright with Chromium)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const src = fs.readFileSync(path.join(__dirname, '../src/components/LogoMark.tsx'), 'utf8');
const svg = /LOGO_SVG = `([\s\S]*?)`;/.exec(src)[1];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const render = async (size, bg, pad, out) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:${bg};width:${size}px;height:${size}px;display:grid;place-items:center">
      <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
    await p.screenshot({ path: out, omitBackground: bg === 'transparent' });
  };
  const assets = path.join(__dirname, '../src/assets');
  await render(64, 'transparent', 0, path.join(assets, 'favicon.png'));
  // iOS rounds the corners itself: full square, ink background behind the tablet.
  await render(180, '#0b1120', 6, path.join(assets, 'apple-touch-icon.png'));
  await render(512, 'transparent', 0, path.join(assets, 'gridrune-mark.png'));
  // PWA (public/manifest.webmanifest): normal icons and a "maskable" one with room around the symbol (Android cuts
  // the corners into a circle or a rounded square).
  const icons = path.join(__dirname, '../public/icons');
  fs.mkdirSync(icons, { recursive: true });
  await render(192, '#0b1120', 8, path.join(icons, 'icon-192.png'));
  await render(512, '#0b1120', 20, path.join(icons, 'icon-512.png'));
  await render(512, '#0b1120', 92, path.join(icons, 'icon-maskable-512.png'));
  await b.close();
  console.log('icons written');
})();
