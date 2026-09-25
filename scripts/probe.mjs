import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto('http://localhost:5173/' + (process.env.Q || ''));
await page.waitForTimeout(Number(process.env.WAIT || 15000));
const r = await page.evaluate(process.argv[2] || `(() => {
  const { scene, camera, gl } = window.__three;
  let meshes = 0, visible = 0;
  scene.traverse(o => { if (o.isMesh) { meshes++; if (o.visible) visible++; } });
  return { meshes, visible, cam: camera.position.toArray().map(v => v.toFixed(2)), info: gl.info.render, frame: gl.info.render.frame };
})()`);
console.log(JSON.stringify(r));
await browser.close();
