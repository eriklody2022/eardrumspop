// EarDrumsPop — This Week's Spins
//
// Reads weekly-spins.json (title/artist/album art/Spotify link for up to
// 5 tracks pulled from Erik's public "This Week's Spins" playlist — no
// credentials in this file) and fills in the card. That file is kept up
// to date by a GitHub Actions workflow (.github/workflows/update-spin.yml)
// that runs on a schedule, and any time Erik triggers it manually after
// updating the playlist.
//
// If weekly-spins.json is missing (workflow hasn't run yet) or fails to
// load, the card just keeps showing the placeholder already in the HTML —
// fails quietly rather than breaking the page.

(function () {
  function $(id) { return document.getElementById(id); }

  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 60) return 'updated just now';
    const hours = Math.round(mins / 60);
    if (hours < 24) return 'updated ' + hours + (hours === 1 ? ' hour ago' : ' hours ago');
    const days = Math.round(hours / 24);
    return 'updated ' + days + (days === 1 ? ' day ago' : ' days ago');
  }

  async function loadSpins() {
    let data;
    try {
      const res = await fetch('weekly-spins.json', { cache: 'no-store' });
      if (!res.ok) return; // no file yet — leave the placeholder in place
      data = await res.json();
    } catch (e) {
      return; // offline, blocked, or missing — leave the placeholder in place
    }

    const tracks = data && data.tracks;
    if (!tracks || !tracks.length) return;

    const list = $('spinsList');
    const template = $('spinItemTemplate');
    const statusEl = $('spinStatus');
    if (!list || !template || !template.content) return;

    list.innerHTML = '';
    tracks.forEach(function (track) {
      const node = template.content.cloneNode(true);
      const link = node.querySelector('.spin-item');
      const art = node.querySelector('.spin-item-art');
      const fallback = node.querySelector('.spin-item-art-fallback');
      const title = node.querySelector('.spin-item-title');
      const artist = node.querySelector('.spin-item-artist');

      if (link && track.url) link.href = track.url;
      if (title) title.textContent = track.title || '';
      if (artist) artist.textContent = track.artist || '';
      if (track.albumArt && art && fallback) {
        art.src = track.albumArt;
        art.style.display = 'block';
        fallback.style.display = 'none';
      }
      list.appendChild(node);
    });

    if (statusEl) {
      const when = timeAgo(data.updatedAt);
      statusEl.textContent = 'From Erik’s playlist' + (when ? ' · ' + when : '');
    }
  }

  document.addEventListener('DOMContentLoaded', loadSpins);
})();
