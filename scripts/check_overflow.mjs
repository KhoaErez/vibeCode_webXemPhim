import { chromium } from 'playwright';

async function checkOverflow() {
  const browser = await chromium.launch({ headless: true });
  const viewports = [360, 390, 768, 1024, 1280];

  for (const width of viewports) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const elements = Array.from(document.querySelectorAll('*'));
      const overflowing = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.right > docWidth + 1) { // 1px threshold for subpixel rounding
          overflowing.push({
            tag: el.tagName,
            class: el.className ? el.className.toString().substring(0, 80) : '',
            right: rect.right,
            excess: rect.right - docWidth,
          });
        }
      }
      return {
        docWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflowingCount: overflowing.length,
        overflowingSamples: overflowing.slice(0, 5),
      };
    });

    console.log(`Viewport ${width}px: docWidth=${result.docWidth}, scrollWidth=${result.scrollWidth}, overflowingCount=${result.overflowingCount}`);
    if (result.overflowingSamples.length > 0) {
      console.log('Sample overflowing elements:', result.overflowingSamples);
    }
    await page.close();
  }

  await browser.close();
}

checkOverflow().catch(console.error);
