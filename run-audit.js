import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';

async function runAudit() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  
  console.log('Launching Chrome from:', chromePath);
  const chrome = await chromeLauncher.launch({
    chromePath: chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
  });

  const url = 'http://localhost:5174/';
  console.log('Auditing URL:', url, 'on port', chrome.port);

  // 1. Mobile Audit
  console.log('\n--- Running Mobile Lighthouse Audit ---');
  const mobileResult = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 2
    }
  });

  const mCategories = mobileResult.lhr.categories;
  console.log('Mobile Results:');
  console.log(`  Performance:    ${Math.round(mCategories.performance.score * 100)}`);
  console.log(`  Accessibility:  ${Math.round(mCategories.accessibility.score * 100)}`);
  console.log(`  Best Practices: ${Math.round(mCategories['best-practices'].score * 100)}`);
  console.log(`  SEO:            ${Math.round(mCategories.seo.score * 100)}`);

  // 2. Desktop Audit
  console.log('\n--- Running Desktop Lighthouse Audit ---');
  const desktopResult = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1
    }
  });

  const dCategories = desktopResult.lhr.categories;
  console.log('Desktop Results:');
  console.log(`  Performance:    ${Math.round(dCategories.performance.score * 100)}`);
  console.log(`  Accessibility:  ${Math.round(dCategories.accessibility.score * 100)}`);
  console.log(`  Best Practices: ${Math.round(dCategories['best-practices'].score * 100)}`);
  console.log(`  SEO:            ${Math.round(dCategories.seo.score * 100)}`);

  // Diagnostics check for any audit with score < 1
  console.log('\n--- Accessibility / SEO / Best Practices Audits with Issues (< 1) ---');
  for (const [auditKey, audit] of Object.entries(mobileResult.lhr.audits)) {
    if (audit.score !== null && audit.score < 1 && audit.scoreDisplayMode !== 'informative' && audit.scoreDisplayMode !== 'notApplicable') {
      if (['color-contrast', 'document-title', 'meta-description', 'html-has-lang', 'link-name', 'image-alt', 'is-crawlable', 'crawlable-anchors', 'robots-txt', 'canonical', 'structured-data'].includes(auditKey) || audit.score === 0) {
        console.log(`  [Mobile Issue] ${auditKey}: ${audit.title} -> ${audit.displayValue || ''} (${audit.explanation || audit.description})`);
        if (audit.details && audit.details.items) {
          console.log('    Items:', JSON.stringify(audit.details.items.slice(0, 3)));
        }
      }
    }
  }

  await chrome.kill();
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
