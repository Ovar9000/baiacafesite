import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

async function test() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = await chromeLauncher.launch({
    chromePath: chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox']
  });

  const result = await lighthouse('http://127.0.0.1:4180/', {
    port: chrome.port,
    output: 'json',
    preset: 'desktop'
  });

  const audits = result.lhr.audits;
  console.log('LCP Element:', audits['largest-contentful-paint-element']?.details?.items);
  console.log('FCP Breakdown:', audits['first-contentful-paint']);
  console.log('Critical Request Chains:', audits['critical-request-chains']?.details?.chains);
  console.log('Network Requests:', audits['network-requests']?.details?.items?.map(r => ({
    url: r.url.substring(0, 60),
    statusCode: r.statusCode,
    transferSize: r.transferSize,
    networkStartTime: r.networkStartTime,
    networkEndTime: r.networkEndTime
  })));

  await chrome.kill();
}

test().catch(console.error);
