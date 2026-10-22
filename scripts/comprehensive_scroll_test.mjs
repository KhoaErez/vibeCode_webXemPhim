import { chromium, devices } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function runComprehensiveTests() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  const logResult = (testName, passed, details) => {
    results.push({ testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark}: ${testName} - ${JSON.stringify(details)}`);
  };

  // Helper to simulate touch swipe up (scrolls down)
  const simulateTouchDrag = async (page, cdpSession, fromY, toY, x = 200) => {
    await cdpSession.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: fromY }],
    });
    const step = fromY > toY ? -20 : 20;
    for (let y = fromY + step; (step < 0 ? y >= toY : y <= toY); y += step) {
      await cdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y }],
      });
      await new Promise(r => setTimeout(r, 15));
    }
    await cdpSession.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(600);
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: HOME PAGE - DESKTOP WHEEL SCROLL (1280x800)
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const before = await page.evaluate(() => window.scrollY);
      await page.mouse.move(640, 400);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => window.scrollY);

      logResult('1. Home Desktop Wheel Scroll', after > 150, { before, after });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 2: HOME PAGE - MOBILE TOUCH SWIPE (iPhone 14 Pro, 393x852)
    // -------------------------------------------------------------------------
    {
      const iPhone = devices['iPhone 14 Pro'];
      const context = await browser.newContext({ ...iPhone });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const cdp = await context.newCDPSession(page);
      const before = await page.evaluate(() => window.scrollY);
      await simulateTouchDrag(page, cdp, 600, 200);
      const after = await page.evaluate(() => window.scrollY);

      logResult('2. Home Mobile iOS Touch Swipe', after > 100, { before, after });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 3: HOME PAGE - MOBILE TOUCH SWIPE (Android Pixel 7, 412x915)
    // -------------------------------------------------------------------------
    {
      const pixel = devices['Pixel 7'];
      const context = await browser.newContext({ ...pixel });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const cdp = await context.newCDPSession(page);
      const before = await page.evaluate(() => window.scrollY);
      await simulateTouchDrag(page, cdp, 650, 250);
      const after = await page.evaluate(() => window.scrollY);

      logResult('3. Home Mobile Android Touch Swipe', after > 100, { before, after });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 4: SMALL MOBILE VIEWPORT (360x640) TOUCH SCROLL
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const cdp = await context.newCDPSession(page);
      const before = await page.evaluate(() => window.scrollY);
      await simulateTouchDrag(page, cdp, 500, 150);
      const after = await page.evaluate(() => window.scrollY);

      logResult('4. Small Mobile (360x640) Touch Scroll', after > 80, { before, after });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 5: CATEGORY / DANH SÁCH PHIM SCROLL
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      // Click "Phim Bộ" category button in desktop navigation
      const phimBoBtn = await page.$('button:has-text("Phim Bộ")');
      if (phimBoBtn) {
        await phimBoBtn.click();
        await page.waitForTimeout(1500);

        const before = await page.evaluate(() => window.scrollY);
        await page.mouse.move(640, 400);
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(600);
        const after = await page.evaluate(() => window.scrollY);

        logResult('5. Category Listing Page Scroll', after > 100, { before, after });
      }
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 6: MOVIE DETAIL PAGE SCROLL (Mobile & Desktop)
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      // Click the hero play button or movie card
      const playBtn = await page.$('button[aria-label="Phát phim tiêu điểm"]');
      if (playBtn) {
        await playBtn.click();
      } else {
        const movieCard = await page.$('.aspect-poster');
        if (movieCard) await movieCard.click();
      }
      await page.waitForTimeout(2000);

        const backBtn = await page.$('button:has-text("Quay lại")');
        const cdp = await context.newCDPSession(page);

        const before = await page.evaluate(() => window.scrollY);
        await simulateTouchDrag(page, cdp, 600, 200);
        const after = await page.evaluate(() => window.scrollY);

        logResult('6. Movie Detail Mobile Touch Scroll', after > 100 && !!backBtn, {
          hasBackBtn: !!backBtn,
          before,
          after,
        });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 7: MODAL SCROLL LOCK & CLEAN RESTORATION
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      // Scroll down first
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(500);
      const scrollBeforeModal = await page.evaluate(() => window.scrollY);

      // Open Feedback Modal
      const feedbackBtn = await page.$('button[title*="Góp ý"], button:has-text("Góp ý")');
      if (feedbackBtn) {
        await feedbackBtn.click();
        await page.waitForTimeout(400);

        const isLocked = await page.evaluate(() => document.body.style.overflow === 'hidden');

        // Close Modal
        const closeBtn = await page.$('button[title="Đóng"], button[aria-label="Đóng"]');
        if (closeBtn) {
          await closeBtn.click();
          await page.waitForTimeout(400);
        }

        const isRestored = await page.evaluate(() => document.body.style.overflow === '');
        const scrollAfterModal = await page.evaluate(() => window.scrollY);

        logResult('7. Modal Scroll Lock & Restore', isLocked && isRestored, {
          isLocked,
          isRestored,
          scrollBeforeModal,
          scrollAfterModal,
        });
      }
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 8: MOBILE MENU DRAWER SCROLL LOCK & RESTORATION
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const hamburgerBtn = await page.$('button[aria-label="Mở menu điều hướng di động"]');
      if (hamburgerBtn) {
        await hamburgerBtn.click();
        await page.waitForTimeout(400);

        const isLocked = await page.evaluate(() => document.body.style.overflow === 'hidden');

        // Click overlay to close
        const overlay = await page.$('.fixed.inset-0.z-\\[90\\]');
        if (overlay) {
          await overlay.click();
          await page.waitForTimeout(400);
        }

        const isRestored = await page.evaluate(() => document.body.style.overflow === '');
        logResult('8. Mobile Menu Drawer Lock & Restore', isLocked && isRestored, { isLocked, isRestored });
      }
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 9: ADMIN DASHBOARD OVERVIEW SCROLL (`/admin`)
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.addCookies([
        { name: 'e2e_mock_admin', value: 'true', domain: 'localhost', path: '/' }
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const before = await page.evaluate(() => window.scrollY);
      await page.mouse.move(640, 400);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => window.scrollY);

      logResult('9. Admin Overview Desktop Wheel Scroll', after > 100, { before, after });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 10: ADMIN DASHBOARD MOBILE TOUCH SCROLL (`/admin`)
    // -------------------------------------------------------------------------
    {
      const iPhone = devices['iPhone 14 Pro'];
      const context = await browser.newContext({ ...iPhone });
      await context.addCookies([
        { name: 'e2e_mock_admin', value: 'true', domain: 'localhost', path: '/' }
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const cdp = await context.newCDPSession(page);
      const before = await page.evaluate(() => window.scrollY);
      await simulateTouchDrag(page, cdp, 650, 250);
      const after = await page.evaluate(() => window.scrollY);

      logResult('10. Admin Overview Mobile Touch Scroll', after > 100, { before, after });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 11: ADMIN USERS PAGE SCROLLABILITY (`/admin/users`)
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 393, height: 500 }, hasTouch: true });
      await context.addCookies([
        { name: 'e2e_mock_admin', value: 'true', domain: 'localhost', path: '/' }
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const dims = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        maxScrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));

      const cdp = await context.newCDPSession(page);
      await simulateTouchDrag(page, cdp, 400, 150);
      const after = await page.evaluate(() => window.scrollY);

      const canScroll = dims.maxScrollY > 0 ? after > 0 : true;
      logResult('11. Admin Users Scrollability', canScroll, { dims, after });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 12: ADMIN FEEDBACKS PAGE SCROLLABILITY (`/admin/feedbacks`)
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 393, height: 500 }, hasTouch: true });
      await context.addCookies([
        { name: 'e2e_mock_admin', value: 'true', domain: 'localhost', path: '/' }
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/admin/feedbacks`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const dims = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        maxScrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));

      const cdp = await context.newCDPSession(page);
      await simulateTouchDrag(page, cdp, 400, 150);
      const after = await page.evaluate(() => window.scrollY);

      const canScroll = dims.maxScrollY > 0 ? after > 0 : true;
      logResult('12. Admin Feedbacks Scrollability', canScroll, { dims, after });
      await context.close();
    }

  } catch (err) {
    console.error('Test Suite Error:', err);
  } finally {
    await browser.close();
  }

  const allPassed = results.every(r => r.passed);
  console.log(`\n========================================`);
  console.log(`SUMMARY: ${results.filter(r => r.passed).length}/${results.length} TESTS PASSED`);
  console.log(`STATUS: ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY! 🎉' : 'SOME TESTS FAILED ⚠️'}`);
  console.log(`========================================\n`);

  if (!allPassed) process.exit(1);
}

runComprehensiveTests();
