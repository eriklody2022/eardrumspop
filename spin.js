// EarDrumsPop — Today's Spin
//
// Reads today-spin.json (a small public file with just a song title, artist,
// album art URL, and Spotify link — no credentials) and fills in the Today's
// Spin card. That file is kept up to date by a GitHub Actions workflow
// (.github/workflows/update-spin.yml) that runs on a schedule, refreshes a
// Spotify access token using repo secrets, and checks Erik's
// currently-playing (falling back to his most recently played track if
// nothing's playing right now). The credentials never touch this file or
// the public page — only the finished song info does.
//
// If today-spin.json is missing (workflow hasn't run yet) or fails to load,
// the card just keeps showing the hardcoded example already in the HTML —
// fails quietly rather than breaking the page.

(function () {
  function $(id) { return document.getElementById(id); }

  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    const days = Math.round(hours / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  async function loadSpin() {
    let data;
    try {
      const res = await fetch('today-spin.json', { cache: 'no-store' });
      if (!res.ok) return; // no file yet — leave the placeholder in place
      data = await res.json();
    } catch (e) {
      return; // offline, blocked, or missing — leave the placeholder in place
    }
    if (!data || !data.title) return;

    const titleEl = $('spinTitle');
    const artistEl = $('spinArtist');
    const statusEl = $('spinStatus');
    const linkEl = $('spinLink');
    const artEl = $('spinArt');
    const artFallbackEl = $('spinArtFallback');

    if (titleEl) titleEl.textContent = data.title;
    if (artistEl) artistEl.textContent = data.artist || '';
    if (linkEl && data.url) linkEl.href = data.url;

    if (statusEl) {
      const when = timeAgo(data.updatedAt);
      statusEl.textContent = data.isPlaying
        ? 'Now playing on Erik’s Spotify'
        : ('Last played on Erik’s Spotify' + (when ? ' · ' + when : ''));
    }

    if (data.albumArt && artEl && artFallbackEl) {
      artEl.src = data.albumArt;
      artEl.style.display = 'block';
      artFallbackEl.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', loadSpin);
})();
