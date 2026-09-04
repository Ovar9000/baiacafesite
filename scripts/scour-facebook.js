import fs from 'node:fs';
import path from 'node:path';

const ENV_FILE = './.env';
const content = fs.readFileSync(ENV_FILE, 'utf-8');
const env = {};
content.split('\n').forEach(line => {
  const t = line.trim();
  if (t && !t.startsWith('#') && t.includes('=')) {
    const [k, ...v] = t.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const pageId = env.FB_PAGE_ID || '640323492494372';
const token = env.FACEBOOK_PAGE_ACCESS_TOKEN || env.FB_PAGE_ACCESS_TOKEN || env.FB_ACCESS_TOKEN;

async function run() {
  const directRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
  const directData = await directRes.json();
  const effectiveToken = directData.access_token || token;

  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/posts?fields=id,message,created_time,permalink_url,attachments{media_type,type,media,unshimmed_url,title,description}&limit=40&access_token=${encodeURIComponent(effectiveToken)}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('API response status:', res.status, 'Total posts in response:', data.data?.length, 'Error:', data.error);
  
  const shares = [];
  for (const post of data.data || []) {
    const attach = post.attachments?.data?.[0];
    const isShare = attach?.type === 'share' || !!attach?.unshimmed_url;
    const msg = post.message || '';
    const title = attach?.title || '';
    const hasPhoto = attach?.media?.image?.src || attach?.subattachments?.data?.[0]?.media?.image?.src;
    
    // Look for shares or customer posts
    if (isShare || title.includes('post') || title.includes('Photos') || msg.includes('💙') || msg.includes('🫶') || msg.includes('thank') || msg.includes('guest') || msg.includes('visit') || msg.includes('bestie')) {
      shares.push({
        id: post.id,
        isShare,
        title,
        message: msg,
        unshimmed_url: attach?.unshimmed_url,
        photo_url: hasPhoto,
        created_time: post.created_time,
        permalink_url: post.permalink_url
      });
    }
  }
  console.log(`Found ${shares.length} shared / customer posts:`);
  for (const s of shares) {
    if (s.photo_url) {
      const fileName = `guest_${s.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
      const filePath = path.join('./public/images/community', fileName);
      if (!fs.existsSync(filePath)) {
        try {
          const imgRes = await fetch(s.photo_url);
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(filePath, buf);
            console.log(`Saved ${fileName}`);
          }
        } catch (e) {
          console.warn('Failed download:', e.message);
        }
      }
      s.local_url = `/images/community/${fileName}`;
    }
    console.log(`--- [${s.id}] ---`);
    console.log(`Title: ${s.title}`);
    console.log(`Message: ${s.message}`);
    console.log(`Local Image: ${s.local_url}`);
  }
}
run().catch(console.error);
