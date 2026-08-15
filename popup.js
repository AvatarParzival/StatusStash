const size = (n) =>
  n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB';

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

async function render() {
  const { history = [] } = await chrome.storage.local.get('history');
  const list = document.getElementById('list');

  list.innerHTML = history.length
    ? history
        .map(
          (h) =>
            `<li><div class="n">${esc(h.filename)}</div>` +
            `<div class="m">${esc(h.type)} &middot; ${size(h.size)} &middot; ` +
            `${new Date(h.at).toLocaleString()}</div></li>`
        )
        .join('')
    : '<li class="m">Nothing saved yet.</li>';
}

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.storage.local.set({ history: [] });
  render();
});

render();
