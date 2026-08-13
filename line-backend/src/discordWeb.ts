const PAGE = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Yoshioka Discord Studio</title>
  <link rel="stylesheet" href="/discord/styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/discord" aria-label="Yoshioka Discord Studio home">
      <span class="brand-mark">Y</span>
      <span><strong>Yoshioka</strong><small>Discord Studio</small></span>
    </a>
    <div class="top-actions"><span id="sessionState" class="status">Checking access</span><button id="logoutButton" class="button ghost hidden" type="button">Log out</button></div>
  </header>

  <main>
    <section id="accessPanel" class="access-card hidden" aria-labelledby="accessTitle">
      <div class="eyebrow">OWNER ACCESS</div>
      <h1 id="accessTitle">เชื่อมต่อผ่าน LINE ก่อนใช้งาน</h1>
      <p>หน้าเว็บนี้ส่งข้อความผ่าน Discord Bot ของคุณโดยตรง จึงต้องยืนยันด้วยบัญชี LINE เจ้าของก่อนทุก session</p>
      <button id="pairButton" class="button primary" type="button">Create one-time access code</button>
      <div id="pairingResult" class="pairing hidden" aria-live="polite">
        <span>ส่งข้อความนี้ไปที่ LINE Bot</span>
        <code id="pairingCommand"></code>
        <small>รหัสใช้ครั้งเดียวและหมดอายุใน 10 นาที หน้านี้จะตรวจสอบให้อัตโนมัติ</small>
      </div>
      <p id="accessError" class="error" role="alert"></p>
    </section>

    <section id="studio" class="studio hidden" aria-label="Discord announcement composer">
      <div class="intro">
        <div><div class="eyebrow">ANNOUNCEMENT WEBSITE</div><h1>Create a Discord announcement</h1><p>Compose, preview, and send only to channels approved in the backend allowlist.</p></div>
        <span class="safe-label">Mentions disabled</span>
      </div>

      <div class="workspace">
        <form id="composer" class="panel editor">
          <div class="section-title"><span>Message</span><small id="contentCount">0 / 2000</small></div>
          <label>Channel<select id="channel" required><option value="">Loading allowed channels...</option></select></label>
          <label>Content<textarea id="content" maxlength="2000" rows="5" placeholder="Write the message shown above the embed"></textarea></label>

          <div class="divider"></div>
          <div class="section-title"><span>Embed</span><small>Optional</small></div>
          <div class="grid two">
            <label>Title<input id="embedTitle" maxlength="256" placeholder="Announcement title"></label>
            <label>Accent color<input id="embedColor" maxlength="7" value="#7c74ff" pattern="#[0-9a-fA-F]{6}" placeholder="#7c74ff"></label>
          </div>
          <label>Title URL<input id="embedUrl" type="url" maxlength="2048" placeholder="https://example.com"></label>
          <label>Description<textarea id="embedDescription" maxlength="4096" rows="8" placeholder="Add details, links, and line breaks"></textarea></label>
          <div class="grid two">
            <label>Image URL<input id="imageUrl" type="url" maxlength="2048" placeholder="https://..."></label>
            <label>Thumbnail URL<input id="thumbnailUrl" type="url" maxlength="2048" placeholder="https://..."></label>
          </div>
          <label>Footer<input id="footerText" maxlength="2048" placeholder="Optional footer"></label>

          <div class="send-row">
            <span id="sendResult" class="send-result" role="status"></span>
            <button id="sendButton" class="button primary" type="submit">Send announcement</button>
          </div>
        </form>

        <aside class="panel preview-panel" aria-label="Discord preview">
          <div class="section-title"><span>Live preview</span><small>Discord-style</small></div>
          <div class="discord-preview">
            <div class="avatar">Y</div>
            <div class="message-body">
              <div class="bot-line"><strong>Yoshioka</strong><span class="bot-tag">BOT</span><time>Today</time></div>
              <p id="previewContent" class="message-content muted">Message content will appear here.</p>
              <div id="embedPreview" class="embed-card">
                <div class="embed-copy">
                  <a id="previewTitle" class="embed-title">Announcement title</a>
                  <p id="previewDescription" class="embed-description">Embed description will appear here.</p>
                  <img id="previewImage" class="embed-image hidden" alt="Embed preview">
                  <small id="previewFooter" class="embed-footer hidden"></small>
                </div>
                <img id="previewThumbnail" class="embed-thumbnail hidden" alt="Thumbnail preview">
              </div>
            </div>
          </div>
          <div class="security-note"><strong>Protected delivery</strong><span>Bot credentials stay in Cloudflare. The browser can target only pre-approved server and channel IDs.</span></div>
        </aside>
      </div>
    </section>
  </main>

  <footer><span>Yoshioka Discord Studio</span><a href="https://github.com/Yoshioka1311/Calendar-Notification/blob/main/PRIVACY_POLICY.md">Privacy</a><a href="https://github.com/Yoshioka1311/Calendar-Notification/blob/main/TERMS_OF_SERVICE.md">Terms</a></footer>
  <script src="/discord/app.js" defer></script>
</body>
</html>`;

const CSS = `:root{color-scheme:dark;--bg:#0b0d14;--panel:#141722;--panel2:#1a1e2b;--line:#2b3040;--text:#f6f7fb;--muted:#a7adbd;--accent:#827cff;--accent2:#a29dff;--danger:#ff737b;--success:#59d499}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% -20%,#242140 0,transparent 40%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh}.topbar{height:72px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - 1260px)/2));background:rgba(11,13,20,.88);backdrop-filter:blur(18px);position:sticky;top:0;z-index:5}.brand{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none}.brand-mark,.avatar{display:grid;place-items:center;background:linear-gradient(145deg,var(--accent),#5550c8);font-weight:800}.brand-mark{width:38px;height:38px;border-radius:12px}.brand span:last-child{display:flex;flex-direction:column;line-height:1.1}.brand small{color:var(--muted);font-size:11px;margin-top:4px;letter-spacing:.08em;text-transform:uppercase}.top-actions{display:flex;align-items:center;gap:10px}.status,.safe-label{font-size:12px;border:1px solid var(--line);background:var(--panel);color:var(--muted);padding:8px 11px;border-radius:999px}.status.connected{color:var(--success);border-color:#265943}main{width:min(1260px,calc(100% - 32px));margin:0 auto;padding:46px 0 72px}.hidden{display:none!important}.access-card{width:min(580px,100%);margin:8vh auto 0;padding:38px;background:var(--panel);border:1px solid var(--line);border-radius:24px;box-shadow:0 26px 90px rgba(0,0,0,.32)}h1{font-size:clamp(28px,4vw,44px);line-height:1.08;margin:9px 0 13px;letter-spacing:-.035em}.access-card h1{font-size:32px}.access-card p,.intro p{color:var(--muted);line-height:1.65;margin:0 0 24px}.eyebrow{color:var(--accent2);font-size:11px;font-weight:800;letter-spacing:.16em}.button{border:0;border-radius:11px;padding:12px 17px;min-height:44px;color:var(--text);font-weight:750;cursor:pointer}.button:disabled{opacity:.55;cursor:wait}.button.primary{background:linear-gradient(135deg,var(--accent),#655fe8);box-shadow:0 8px 24px rgba(108,101,235,.2)}.button.ghost{background:transparent;border:1px solid var(--line)}.pairing{margin-top:22px;background:#0d1018;border:1px solid var(--line);padding:18px;border-radius:14px;display:flex;flex-direction:column;gap:10px}.pairing span,.pairing small{color:var(--muted)}.pairing code{font-size:23px;letter-spacing:.08em;color:var(--accent2);user-select:all}.error{color:var(--danger)!important;margin:16px 0 0!important;min-height:22px}.intro{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:26px}.intro p{margin-bottom:0}.safe-label{color:var(--success);white-space:nowrap}.workspace{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr);gap:20px;align-items:start}.panel{background:rgba(20,23,34,.94);border:1px solid var(--line);border-radius:18px}.editor{padding:24px}.section-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-weight:800}.section-title small{font-weight:500;color:var(--muted)}label{display:flex;flex-direction:column;gap:8px;color:#d7dae4;font-size:13px;font-weight:650;margin-bottom:16px}input,textarea,select{width:100%;border:1px solid var(--line);background:#0e111a;color:var(--text);border-radius:10px;padding:12px 13px;font:inherit;outline:none;transition:.18s border-color,.18s box-shadow}textarea{resize:vertical;line-height:1.5}input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(130,124,255,.15)}.grid.two{display:grid;grid-template-columns:1fr 1fr;gap:13px}.divider{height:1px;background:var(--line);margin:24px 0}.send-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:8px}.send-result{font-size:13px;color:var(--muted)}.send-result.ok{color:var(--success)}.send-result.bad{color:var(--danger)}.preview-panel{padding:24px;position:sticky;top:92px}.discord-preview{background:#313338;border-radius:14px;padding:22px;display:flex;gap:15px;min-height:210px}.avatar{width:42px;height:42px;border-radius:50%;flex:0 0 auto}.message-body{min-width:0;flex:1}.bot-line{display:flex;align-items:center;gap:7px}.bot-line time{font-size:11px;color:#949ba4}.bot-tag{background:#5865f2;border-radius:3px;padding:1px 4px;font-size:10px}.message-content{white-space:pre-wrap;line-height:1.42;margin:5px 0 10px}.muted{color:#aeb3bd}.embed-card{border-left:4px solid var(--accent);background:#2b2d31;border-radius:4px;max-width:520px;padding:13px 14px;display:flex;gap:14px}.embed-copy{min-width:0;flex:1}.embed-title{display:block;color:#f2f3f5;font-weight:750;margin-bottom:8px;word-break:break-word}.embed-title[href]{color:#00a8fc;text-decoration:none}.embed-description{white-space:pre-wrap;word-break:break-word;color:#dbdee1;font-size:14px;line-height:1.35;margin:0}.embed-image{display:block;width:100%;max-height:280px;object-fit:cover;border-radius:5px;margin-top:14px}.embed-thumbnail{width:80px;height:80px;object-fit:cover;border-radius:5px}.embed-footer{display:block;color:#b5bac1;margin-top:12px}.security-note{display:flex;gap:10px;flex-direction:column;margin-top:16px;padding:16px;border:1px solid #304738;background:#101a15;border-radius:12px}.security-note strong{color:var(--success);font-size:13px}.security-note span{color:var(--muted);font-size:12px;line-height:1.5}footer{width:min(1260px,calc(100% - 32px));margin:0 auto;padding:24px 0 34px;border-top:1px solid var(--line);display:flex;gap:18px;color:var(--muted);font-size:12px}footer span{margin-right:auto}footer a{color:var(--muted)}@media(max-width:900px){.workspace{grid-template-columns:1fr}.preview-panel{position:static;order:-1}.intro{align-items:flex-start;flex-direction:column}.safe-label{align-self:flex-start}}@media(max-width:560px){.topbar{height:64px;padding:0 16px}.status{display:none}main{width:min(100% - 20px,1260px);padding-top:28px}.access-card{padding:24px;border-radius:18px}.editor,.preview-panel{padding:17px}.grid.two{grid-template-columns:1fr;gap:0}.send-row{align-items:stretch;flex-direction:column}.send-row .button{width:100%}.discord-preview{padding:16px}.embed-thumbnail{width:64px;height:64px}.intro h1{font-size:32px}}`;

const JS = `'use strict';
const $ = (id) => document.getElementById(id);
const state = { poll: 0 };

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function showConnected() {
  clearInterval(state.poll);
  $('accessPanel').classList.add('hidden');
  $('studio').classList.remove('hidden');
  $('logoutButton').classList.remove('hidden');
  $('sessionState').textContent = 'Owner connected';
  $('sessionState').classList.add('connected');
  loadChannels();
}

function showDisconnected() {
  $('studio').classList.add('hidden');
  $('logoutButton').classList.add('hidden');
  $('accessPanel').classList.remove('hidden');
  $('sessionState').textContent = 'Owner access required';
  $('sessionState').classList.remove('connected');
}

async function checkSession() {
  try {
    const result = await api('/api/discord/web/session');
    if (result.authenticated) showConnected(); else showDisconnected();
  } catch { showDisconnected(); }
}

async function startPairing() {
  $('pairButton').disabled = true;
  $('accessError').textContent = '';
  try {
    const result = await api('/api/discord/web/pairing/start', { method: 'POST', body: '{}' });
    $('pairingCommand').textContent = 'WEB ' + result.pairingCode;
    $('pairingResult').classList.remove('hidden');
    state.poll = setInterval(checkSession, 3000);
  } catch (error) {
    $('accessError').textContent = error.message;
  } finally { $('pairButton').disabled = false; }
}

async function loadChannels() {
  const select = $('channel');
  try {
    const result = await api('/api/discord/web/channels');
    select.replaceChildren();
    if (!result.channels.length) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = 'No allowed channels configured'; select.append(option); return;
    }
    for (const channel of result.channels) {
      const option = document.createElement('option');
      option.value = channel.id; option.textContent = '#' + channel.name; select.append(option);
    }
  } catch (error) {
    select.replaceChildren();
    const option = document.createElement('option');
    option.value = ''; option.textContent = error.message; select.append(option);
  }
}

function httpsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

function updateImage(element, value) {
  const url = httpsUrl(value.trim());
  if (url) { element.src = url; element.classList.remove('hidden'); }
  else { element.removeAttribute('src'); element.classList.add('hidden'); }
}

function preview() {
  const content = $('content').value;
  $('contentCount').textContent = content.length + ' / 2000';
  $('previewContent').textContent = content || 'Message content will appear here.';
  $('previewContent').classList.toggle('muted', !content);
  const title = $('embedTitle').value;
  const description = $('embedDescription').value;
  const titleLink = httpsUrl($('embedUrl').value.trim());
  $('previewTitle').textContent = title || 'Announcement title';
  if (titleLink) $('previewTitle').href = titleLink; else $('previewTitle').removeAttribute('href');
  $('previewDescription').textContent = description || 'Embed description will appear here.';
  const footer = $('footerText').value;
  $('previewFooter').textContent = footer;
  $('previewFooter').classList.toggle('hidden', !footer);
  updateImage($('previewImage'), $('imageUrl').value);
  updateImage($('previewThumbnail'), $('thumbnailUrl').value);
}

function payload() {
  return {
    channelId: $('channel').value,
    content: $('content').value,
    embed: {
      title: $('embedTitle').value,
      description: $('embedDescription').value,
      url: $('embedUrl').value,
      color: $('embedColor').value,
      imageUrl: $('imageUrl').value,
      thumbnailUrl: $('thumbnailUrl').value,
      footerText: $('footerText').value,
    },
  };
}

async function send(event) {
  event.preventDefault();
  const data = payload();
  if (!data.channelId) return;
  if (!data.content.trim() && !data.embed.title.trim() && !data.embed.description.trim() && !data.embed.imageUrl.trim()) {
    $('sendResult').textContent = 'Add message content or embed details first.';
    $('sendResult').className = 'send-result bad'; return;
  }
  if (!window.confirm('Send this announcement to the selected Discord channel?')) return;
  $('sendButton').disabled = true;
  $('sendResult').textContent = 'Sending securely...';
  $('sendResult').className = 'send-result';
  try {
    const result = await api('/api/discord/web/announcements', {
      method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    $('sendResult').textContent = 'Sent successfully. Message ID ' + result.messageId;
    $('sendResult').className = 'send-result ok';
  } catch (error) {
    $('sendResult').textContent = error.message;
    $('sendResult').className = 'send-result bad';
  } finally { $('sendButton').disabled = false; }
}

async function logout() {
  await api('/api/discord/web/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
  location.reload();
}

$('pairButton').addEventListener('click', startPairing);
$('logoutButton').addEventListener('click', logout);
$('composer').addEventListener('submit', send);
for (const element of document.querySelectorAll('input, textarea')) element.addEventListener('input', preview);
preview();
checkSession();`;

function response(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      'Cache-Control': contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Content-Type': `${contentType}; charset=utf-8`,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}

export function serveDiscordWeb(pathname: string): Response | undefined {
  if (pathname === '/discord' || pathname === '/discord/') return response(PAGE, 'text/html');
  if (pathname === '/discord/styles.css') return response(CSS, 'text/css');
  if (pathname === '/discord/app.js') return response(JS, 'text/javascript');
  return undefined;
}
