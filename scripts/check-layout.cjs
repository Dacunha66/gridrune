// Layout check for small phones: opens the game's main screens (as a guest) in iPhone SE size and reports
//  – buttons that cannot be reached (outside the screen and not inside a scrollable area),
//  – pages wider than the screen (sideways scrolling).
// Usage: start the game (npx vite --port 4196), then: node scripts/check-layout.cjs [url] [width] [height]
// Exit code 1 if something is wrong. Needs Playwright (installed in the development environment, not in CI).
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:4196/';
const W = Number(process.argv[3] || 375);
const H = Number(process.argv[4] || 667);

/** Runs in the page: what is wrong on the current screen. */
function audit() {
  const problems = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`Seite ${document.documentElement.scrollWidth}px breit (Bildschirm ${innerWidth}px)`);
  const scrollable = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return true;
      if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  for (const b of document.querySelectorAll('button, a[href], input, select')) {
    if (!b.offsetParent || b.disabled) continue;
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const outside = r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1;
    if (outside && !scrollable(b)) problems.push(`nicht erreichbar: „${(b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 40)}“`);
  }
  return problems;
}

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // Every screen starts from a fresh main menu (some screens have no way back in the bottom bar).
  const home = async (first = false) => {
    await p.goto(URL);
    await p.waitForTimeout(first ? 5000 : 3500);
    await p.evaluate(() => localStorage.setItem('gridrune/tutorial', 'skipped'));
    const guest = p.locator('button:visible', { hasText: /Als Gast/ });
    if (await guest.count()) { await guest.first().click(); await p.waitForTimeout(1200); }
    const offer = p.locator('.tutorial-offer button', { hasText: 'Überspringen' });
    if (await offer.count()) { await offer.click(); await p.waitForTimeout(600); }
  };
  await home(true);
  const tab = (name) => p.locator('.menu-tabs button', { hasText: name }).first();
  const click = async (sel, text) => { await p.locator(sel, { hasText: text }).first().click({ timeout: 4000 }); await p.waitForTimeout(1200); };
  const screens = [
    ['Hauptmenü', async () => {}],
    ['Spielen', async () => { await p.locator('.menu-play').click(); await p.waitForTimeout(800); }],
    ['Einfaches Spiel', async () => { await home(); await p.locator('.menu-play').click(); await p.waitForTimeout(600); await click('button', 'Einfaches Spiel'); }],
    ['Kampagne', async () => { await home(); await p.locator('.menu-play').click(); await p.waitForTimeout(600); await click('button', 'Kampagne'); }],
    ['Rangliste', async () => { await home(); await p.locator('.menu-play').click(); await p.waitForTimeout(600); await click('.btn-league', 'Rangliste'); }],
    ['Karten', async () => { await home(); await tab('Karten').click(); await p.waitForTimeout(800); }],
    ['Sammlung', async () => { await home(); await tab('Karten').click(); await p.waitForTimeout(800); await click('button', 'Sammlung'); }],
    ['Deck bearbeiten', async () => { await home(); await tab('Karten').click(); await p.waitForTimeout(800); await click('button', 'Deck bearbeiten'); }],
    ['Shop', async () => { await home(); await tab('Shop').click(); await p.waitForTimeout(1200); }],
    ['Erfolge', async () => { await home(); await tab('Erfolge').click(); await p.waitForTimeout(1200); }],
    ['Community', async () => { await home(); await tab('Community').click(); await p.waitForTimeout(1200); }],
    ['Mehr', async () => { await home(); await tab('Mehr').click(); await p.waitForTimeout(800); }],
    ['Regeln', async () => { await click('button', 'Regeln'); }],
  ];
  let bad = 0;
  for (const [name, go] of screens) {
    try {
      await go();
    } catch (e) {
      console.log(`?  ${name}: nicht geöffnet (${String(e.message).split('\n')[0]})`);
      bad++;
      continue;
    }
    const problems = await p.evaluate(audit);
    if (problems.length) bad++;
    console.log(`${problems.length ? '✗' : '✓'}  ${name}${problems.length ? `: ${problems.join(' · ')}` : ''}`);
  }
  if (errors.length) console.log('Fehler im Spiel:', errors.slice(0, 5));
  await br.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
