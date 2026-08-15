// StatusStash - content script
// Everything fragile lives in CONFIG. When WhatsApp Web changes its DOM,
// this object should be the only thing you need to edit.

const CONFIG = {
  // Ignore anything narrower than this (avatars, chat thumbnails, icons).
  minWidth: 200,

  // Elements that may hold decrypted status media.
  media: ['img[src^="blob:"]', 'video[src^="blob:"]'],

  // Wrapper containing the open status viewer. Only used to scope the
  // view-once check now - the button no longer lives inside it.
  viewer: 'div[role="dialog"]',

  // "View once" markers. If any match, we refuse to save.
  viewOnce: [
    '[data-testid="view-once-status"]',
    '[data-icon="view-once"]',
    '[data-icon="viewonce"]'
  ],

  // Best-effort sender name for the filename.
  senderName: [
    '[data-testid="status-viewer-header"] span[dir="auto"]',
    'header span[title]'
  ],

  // Blob URLs carry no filename or extension, so we map from MIME type.
  extByMime: {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov'
  },

  // Default resting place is set in content.css (right side, clear of the
  // reply bar). Dragging switches the button to inline left/top coordinates.

  // Press this key to save without touching the mouse.
  hotkey: 's'
};

// ---------------------------------------------------------------- helpers

function visibleMedia() {
  // Largest on-screen blob element wins. Filters out avatars and thumbs.
  let best = null;
  let bestArea = 0;

  for (const el of document.querySelectorAll(CONFIG.media.join(','))) {
    const r = el.getBoundingClientRect();
    if (r.width < CONFIG.minWidth) continue;
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const area = r.width * r.height;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}

function isViewOnce(el) {
  const scope = el.closest(CONFIG.viewer) || document.body;
  return CONFIG.viewOnce.some((s) => scope.querySelector(s));
}

function senderName() {
  for (const s of CONFIG.senderName) {
    const t = document.querySelector(s)?.textContent?.trim();
    if (t) return t.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
  }
  return 'status';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function sha256(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ------------------------------------------------------------ the button

const btn = document.createElement('button');
btn.className = 'ss-btn';
btn.type = 'button';
btn.innerHTML =
  '<svg class="ss-ico" viewBox="0 0 24 24" width="17" height="17" ' +
  'fill="none" stroke="currentColor" stroke-width="2.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 3.5 V14"/><path d="M7.5 10 L12 14.6 L16.5 10"/>' +
  '<path d="M6 19.5 H18"/></svg>' +
  '<span class="ss-txt">Save</span>';
btn.setAttribute('aria-label', 'Save status media');
document.documentElement.appendChild(btn);

const label = btn.querySelector('.ss-txt');
let busy = false;

function setState(text, state) {
  label.textContent = text;
  btn.dataset.state = state || '';
}

function resetSoon() {
  setTimeout(() => {
    busy = false;
    setState('Save', '');
  }, 2200);
}

// --- position (draggable, persisted) ---

function clamp(left, top) {
  const r = btn.getBoundingClientRect();
  return {
    left: Math.min(Math.max(8, left), innerWidth - r.width - 8),
    top: Math.min(Math.max(8, top), innerHeight - r.height - 8)
  };
}

// Switching to inline left/top overrides the right/bottom anchor from CSS.
function place(left, top) {
  const p = clamp(left, top);
  btn.style.left = p.left + 'px';
  btn.style.top = p.top + 'px';
  btn.style.right = 'auto';
  btn.style.bottom = 'auto';
  return p;
}

async function restorePos() {
  const { btnPos } = await chrome.storage.local.get('btnPos');
  if (!btnPos || typeof btnPos.left !== 'number') return; // keep CSS default
  // Applied unclamped: the button is still hidden, so it has no measurable
  // size yet. sync() clamps it the first time it becomes visible.
  btn.style.left = btnPos.left + 'px';
  btn.style.top = btnPos.top + 'px';
  btn.style.right = 'auto';
  btn.style.bottom = 'auto';
}

let dragging = false;
let moved = false;
let offX = 0;
let offY = 0;

btn.addEventListener('pointerdown', (e) => {
  // Stop WhatsApp from treating this as a tap on the status (which advances it).
  e.preventDefault();
  e.stopPropagation();
  dragging = true;
  moved = false;
  const r = btn.getBoundingClientRect();
  offX = e.clientX - r.left;
  offY = e.clientY - r.top;
  btn.setPointerCapture(e.pointerId);
  btn.dataset.drag = '1';
});

btn.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const left = e.clientX - offX;
  const top = e.clientY - offY;
  if (Math.abs(left - btn.offsetLeft) > 4 || Math.abs(top - btn.offsetTop) > 4) {
    moved = true;
  }
  place(left, top);
});

btn.addEventListener('pointerup', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!dragging) return;
  dragging = false;
  delete btn.dataset.drag;

  if (moved) {
    // Was a drag: remember where the user parked it.
    const p = clamp(btn.offsetLeft, btn.offsetTop);
    await chrome.storage.local.set({ btnPos: p });
  } else {
    // Was a plain click: save.
    doSave();
  }
});

// Belt and braces: never let a click bubble into the status viewer.
btn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener('resize', () => {
  // Only reclamp a user-dragged button; otherwise leave the CSS right anchor,
  // which already tracks the window edge.
  if (btn.style.left) place(btn.offsetLeft, btn.offsetTop);
});

// --- hotkey ---

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key?.toLowerCase() !== CONFIG.hotkey) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    // Don't hijack typing in the reply box or any input.
    if (
      t instanceof HTMLElement &&
      (t.isContentEditable ||
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA')
    ) {
      return;
    }
    if (!btn.classList.contains('ss-show')) return;
    e.preventDefault();
    e.stopPropagation();
    doSave();
  },
  true
);

// ------------------------------------------------------------- save logic

async function doSave() {
  if (busy) return;

  const el = visibleMedia();
  if (!el) {
    busy = true;
    setState('No media', 'warn');
    return resetSoon();
  }

  busy = true;

  try {
    if (isViewOnce(el)) {
      setState('View once', 'warn');
      return resetSoon();
    }

    setState('Saving...', 'busy');

    // Blob URLs are same-origin, so a content script can fetch them.
    // Must happen while the status is on screen; WhatsApp revokes the URL
    // once the viewer closes.
    const res = await fetch(el.src);
    const buf = await res.arrayBuffer();

    if (!buf.byteLength) {
      // Empty means MediaSource-fed video rather than a plain blob.
      setState('Streamed', 'warn');
      return resetSoon();
    }

    const rawType =
      res.headers.get('content-type') ||
      (el.tagName === 'VIDEO' ? 'video/mp4' : 'image/jpeg');
    const type = rawType.split(';')[0].trim();
    const blob = new Blob([buf], { type });

    const sha = await sha256(buf);
    const { history = [] } = await chrome.storage.local.get('history');

    if (history.some((h) => h.sha === sha)) {
      setState('Already saved', 'warn');
      return resetSoon();
    }

    const ext = CONFIG.extByMime[type] || type.split('/')[1] || 'bin';
    const filename = `${senderName()}_${stamp()}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    history.unshift({
      filename,
      type,
      size: blob.size,
      sha,
      at: Date.now()
    });
    await chrome.storage.local.set({ history: history.slice(0, 100) });

    setState('Saved', 'ok');
    resetSoon();
  } catch (err) {
    console.error('[StatusStash]', err);
    setState('Failed', 'err');
    resetSoon();
  }
}

// ------------------------------------------------------------ visibility

function sync() {
  const has = !!visibleMedia();
  const was = btn.classList.contains('ss-show');
  btn.classList.toggle('ss-show', has);
  // First reveal: now that the button has a measurable size, keep a restored
  // position inside the viewport.
  if (has && !was && btn.style.left) place(btn.offsetLeft, btn.offsetTop);
}

new MutationObserver(sync).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src']
});

// SPA fallback: attribute swaps don't always fire usefully.
setInterval(sync, 700);

restorePos().then(sync);

console.log('[StatusStash] active - click the floating button, drag to move, or press "s"');
