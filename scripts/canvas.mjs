// Saves the WebGL canvas contents directly (bypasses compositor quirks in headless).
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const [out = 'canvas.png', wait = '15000', evalJs = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 900), height: Number(process.env.H || 560) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
await page.goto('http://localhost:5173/' + (process.env.Q || ''));
await page.waitForTimeout(Number(wait));
if (evalJs) { console.log(await page.evaluate(evalJs)); await page.waitForTimeout(Number(process.env.WAIT2 || wait)); }
const data = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => res(document.querySelector('canvas').toDataURL('image/png')))));
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
