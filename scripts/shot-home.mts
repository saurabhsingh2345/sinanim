import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 2000 } });
await p.goto('http://localhost:3002', { waitUntil: 'networkidle' });
await p.waitForTimeout(12000); // let the thumb queue render several previews
await p.screenshot({ path: '/tmp/home-page.png', fullPage: false });
await b.close();
console.log('shot taken');
