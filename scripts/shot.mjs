// Usage: node scripts/shot.mjs out.png [waitMs] [script-to-eval]
import { chromium } from 'playwright';
const [out = 'shot.png', wait = '9000', evalJs = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1100), height: Number(process.env.H || 700) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/' + (process.env.Q || ''), { waitUntil: 'load' });
await page.waitForTimeout(Number(wait));
if (evalJs) {
  await page.evaluate(evalJs);
  await page.waitForTimeout(Number(wait));
}
// Headless Chromium doesn't composite WebGL into page screenshots: swap in a still of the canvas.
await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
  const c = document.querySelector('canvas');
  if (!c) return res(null);
  const img = document.createElement('img');
  img.src = c.toDataURL('image/png');
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  c.parentElement.appendChild(img);
  c.style.visibility = 'hidden';
  img.onload = () => res(null);
})));
await page.screenshot({ path: out, timeout: 180000 });
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
