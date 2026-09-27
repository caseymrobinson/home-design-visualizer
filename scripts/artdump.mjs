import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:5173/?pdb=1');
await p.waitForTimeout(4000);
const urls = await p.evaluate(async () => {
  const m = await import('/src/three/items/Art.tsx');
  const pals = ['sage', 'warm', 'earth', 'blush', 'mono'];
  const cs = m.ART_STYLES.map((s, i) => m.paintArt(s, pals[i % pals.length], 3, 0.78, 300));
  const sheet = document.createElement('canvas');
  sheet.width = cs.reduce((a, c) => a + c.width + 12, 0);
  sheet.height = 300;
  const g = sheet.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, sheet.width, sheet.height);
  let x = 0;
  for (const c of cs) { g.drawImage(c, x, 0); x += c.width + 12; }
  return { sheet: sheet.toDataURL(), order: m.ART_STYLES.join(',') };
});
console.log(urls.order);
writeFileSync('screenshots/art-sheet.png', Buffer.from(urls.sheet.split(',')[1], 'base64'));
await b.close();
