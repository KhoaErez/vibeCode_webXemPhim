import { chromium, devices } from 'playwright';

async function testScroll() {
  const browser = await chromium.launch({ headless: true });

  console.log('=== TEST 1: DESKTOP WHEEL SCROLL (1280x800) ===');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await desktopPage.waitForTimeout(2000);

  const initialDesktop = await desktopPage.evaluate(() => ({
    scrollY: window.scrollY,
    htmlScrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body.scrollTop,
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  }));
  console.log('Initial desktop state:', initialDesktop);

  // Perform mouse wheel scroll
  await desktopPage.mouse.move(640, 400);
  await desktopPage.mouse.wheel(0, 500);
  await desktopPage.waitForTimeout(1000);

  const afterWheelDesktop = await desktopPage.evaluate(() => ({
    scrollY: window.scrollY,
    htmlScrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body.scrollTop,
  }));
  console.log('After wheel desktop:', afterWheelDesktop);

  console.log('\n=== TEST 2: MOBILE TOUCH SCROLL (iPhone 14 Pro, 393x852) ===');
  const iPhone = devices['iPhone 14 Pro'] || {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  };
  const mobileContext = await browser.newContext({
    ...iPhone,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(2000);

  const initialMobile = await mobilePage.evaluate(() => ({
    scrollY: window.scrollY,
    htmlScrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body.scrollTop,
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    bodyTouchAction: getComputedStyle(document.body).touchAction,
    bodyOverscroll: getComputedStyle(document.body).overscrollBehaviorY,
  }));
  console.log('Initial mobile state:', initialMobile);

  // Simulate touch drag (swipe up from y=600 to y=200)
  const touchX = 200;
  const client = await mobileContext.newCDPSession(mobilePage);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: touchX, y: 600 }],
  });
  for (let y = 580; y >= 200; y -= 20) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: touchX, y: y }],
    });
    await new Promise(r => setTimeout(r, 20));
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await mobilePage.waitForTimeout(1000);

  const afterTouchMobile = await mobilePage.evaluate(() => ({
    scrollY: window.scrollY,
    htmlScrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body.scrollTop,
  }));
  console.log('After touch swipe mobile:', afterTouchMobile);

  await browser.close();
}

testScroll().catch(e => console.error(e));
