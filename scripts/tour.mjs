// Scripted tour: screenshots of each panel in one session.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await page.goto('http://localhost:5173/?pdb=1');
await page.waitForTimeout(Number(process.env.WAIT || 40000));
const snap = async (name) => {
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    document.querySelectorAll('img[data-snap]').forEach((i) => i.remove());
    const c = document.querySelector('canvas');
    const img = document.createElement('img');
    img.dataset.snap = '1';
    img.src = c.toDataURL('image/png');
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    c.parentElement.appendChild(img);
    img.onload = () => res(null);
  })));
  await page.screenshot({ path: `screenshots/${name}.png`, timeout: 180000 });
  await page.evaluate(() => document.querySelectorAll('img[data-snap]').forEach((i) => i.remove()));
};
const steps = (process.env.STEPS || 'finishes,room,light,add,designs,inspect').split(',');
for (const s of steps) {
  if (s === 'inspect') {
    await page.evaluate(() => { const st = window.__store.getState(); st.setPanel(null); st.select(st.design().items.find(i => i.type === 'vanity').id); });
  } else {
    await page.evaluate((p) => { const st = window.__store.getState(); st.select(null); st.set({ panel: p }); }, s);
  }
  await page.waitForTimeout(Number(process.env.STEP_WAIT || 15000));
  await snap(`tour-${s}`);
  console.log('shot', s);
}
await browser.close();
