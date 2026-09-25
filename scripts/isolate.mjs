import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
await p.goto('http://localhost:5173/?pdb=1' + (process.env.Q||''));
await p.waitForTimeout(35000);
const shot = async (n) => { const d = await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL())))); writeFileSync(`screenshots/iso-${n}.png`, Buffer.from(d.split(',')[1],'base64')); };
await shot('base');
for (const [n, patch] of JSON.parse(process.env.STEPS)) {
  await p.evaluate((patch) => window.__store.getState().update(d => Object.assign(d.lighting, patch), false), patch);
  await p.waitForTimeout(12000); await shot(n);
}
await b.close();
