export const DISCORD_WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Discord Announcement Builder</title>
  <link rel="stylesheet" href="/discord/styles.css">
</head>
<body>
  <header class="topbar">
    <div class="bot-identity" aria-live="polite">
      <img id="headerAvatar" class="bot-avatar hidden" alt="">
      <span id="headerAvatarFallback" class="bot-avatar fallback">B</span>
      <span class="identity-copy"><strong id="botName">Discord Bot</strong><small><i id="connectionDot" class="connection-dot unknown"></i><span id="connectionState">Checking connection…</span></small></span>
    </div>
  </header>

  <main>
    <section class="intro">
      <div><div class="eyebrow">DISCORD ANNOUNCEMENT BUILDER</div><h1>Create an announcement</h1><p>Build a message, preview it instantly, and deliver it only to approved Discord destinations.</p></div>
      <span class="safe-label">Mentions disabled</span>
    </section>

    <div class="workspace">
      <form id="composer" class="panel editor" novalidate>
        <section class="editor-section">
          <div class="section-heading"><div><span class="step">01</span><h2>Destination</h2></div><small>Allowlisted only</small></div>
          <div class="grid two">
            <label>Server<select id="guild" required><option value="">Loading servers…</option></select></label>
            <label>Channel<select id="channel" required disabled><option value="">Select a server first</option></select></label>
          </div>
        </section>

        <section class="editor-section">
          <div class="section-heading"><div><span class="step">02</span><h2>Message</h2></div><small id="contentCount">0 / 2000</small></div>
          <label class="sr-only" for="content">Message content</label>
          <textarea id="content" maxlength="2000" rows="6" placeholder="Write the message shown above your embeds"></textarea>
        </section>

        <section class="editor-section">
          <div class="section-heading"><div><span class="step">03</span><h2>Embeds</h2></div><button id="addEmbed" class="button secondary small" type="button">+ Add Embed</button></div>
          <p class="section-help">Add up to 10 rich cards. Collapse or reorder them as the announcement grows.</p>
          <div id="embedEditors" class="embed-editors"></div>
          <p id="embedEmpty" class="empty-editor">No embeds yet. Add one when the message needs structured details.</p>
        </section>

        <section class="editor-section">
          <div class="section-heading"><div><span class="step">04</span><h2>Images</h2></div><small id="imageCount">0 / 4</small></div>
          <input id="imageInput" class="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple>
          <button id="uploadArea" class="upload-area" type="button"><strong>Upload images</strong><span>PNG, JPEG, WEBP, or GIF · max 5 MB each</span></button>
          <div id="imageList" class="image-list"></div>
          <p id="imageError" class="inline-error" role="alert"></p>
        </section>

        <details class="advanced editor-section">
          <summary><span><span class="step">05</span>Advanced</span><small>URLs and delivery safety</small></summary>
          <div class="advanced-copy"><strong>Allowed mentions are disabled.</strong><span>Text such as @everyone can be displayed but will not notify members. HTTPS image and icon URLs remain available inside each embed as an advanced option.</span></div>
        </details>

        <div class="send-row">
          <span id="sendResult" class="send-result" role="status">Checking bot and destinations…</span>
          <button id="sendButton" class="button primary" type="submit" disabled>Send Announcement</button>
        </div>
      </form>

      <aside class="panel preview-panel" aria-label="Live Discord preview">
        <div class="preview-heading"><div><span class="live-dot"></span><strong>Live Preview</strong></div><small>Updates while you type</small></div>
        <div class="discord-canvas">
          <div id="emptyPreview" class="empty-preview"><strong>Your Discord announcement will appear here.</strong><span>Start typing or add an embed on the left.</span></div>
          <div id="messagePreview" class="discord-message hidden">
            <img id="previewAvatar" class="message-avatar hidden" alt="">
            <span id="previewAvatarFallback" class="message-avatar fallback">B</span>
            <div class="message-body">
              <div class="message-meta"><strong id="previewBotName">Discord Bot</strong><span class="bot-tag">APP</span><time>Today at <span id="previewTime"></span></time></div>
              <p id="previewContent" class="message-content hidden"></p>
              <div id="previewEmbeds" class="preview-embeds"></div>
              <div id="previewAttachments" class="preview-attachments"></div>
            </div>
          </div>
        </div>
        <div class="security-note"><strong>Protected delivery</strong><span>The bot token stays in Cloudflare. The backend validates email access, files, payload limits, guilds, and channels before contacting Discord.</span></div>
      </aside>
    </div>
  </main>

  <footer><span>Discord Announcement Builder</span><a href="https://github.com/Yoshioka1311/Calendar-Notification/blob/main/PRIVACY_POLICY.md">Privacy</a><a href="https://github.com/Yoshioka1311/Calendar-Notification/blob/main/TERMS_OF_SERVICE.md">Terms</a></footer>
  <script src="/discord/app.js" defer></script>
</body>
</html>`;
