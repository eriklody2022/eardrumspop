// EarDrumsPop — Spins Archive
//
// Reads spins-archive.json (an array of past months, newest first — each
// with a month key, a display label, and up to 6 tracks) and renders one
// section per month, reusing the same card style as the homepage's This
// Month's Spins widget. That file is written automatically by
// scripts/update-spin.js whenever the calendar month rolls over — see the
// comments there for exactly when that happens.
//
// Until the first month actually rolls over, this file is just an empty
// array, so the page shows a friendly "nothing archived yet" message
// instead of a blank section.

(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function trackCard(track) {
    const art = track.albumArt
      ? '<img src="' + escapeHtml(track.albumArt) + '" alt="" style="display:block; width:100%; height:100%; object-fit:cover;">'
      : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M9 18V5.5l10-2v11" stroke="#ece0c8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="7" cy="18" r="2.2" stroke="#ece0c8" stroke-width="1.6"/>' +
        '<circle cx="17" cy="16.5" r="2.2" stroke="#ece0c8" stroke-width="1.6"/>' +
        '</svg>';

    return (
      '<a href="' + encodeURI(track.url || '#') + '" target="_blank" rel="noopener" ' +
      'style="flex:1 1 140px; max-width:190px; background:#fffaf0; border:1.5px solid rgba(56,42,30,0.14); border-radius:6px; padding:16px; display:flex; flex-direction:column; gap:10px; align-items:center; text-align:center; color:inherit;">' +
        '<div style="width:100%; aspect-ratio:1/1; border-radius:6px; background:#382a1e; display:flex; align-items:center; justify-content:center; overflow:hidden;">' + art + '</div>' +
        '<div style="display:flex; flex-direction:column; gap:2px; min-width:0; width:100%;">' +
          '<span style="font-family:\'Zilla Slab\', serif; font-weight:700; font-size:14px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(track.title) + '</span>' +
          '<span style="font-size:12px; color:rgba(56,42,30,0.6); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(track.artist) + '</span>' +
        '</div>' +
      '</a>'
    );
  }

  function monthSection(month) {
    const cards = (month.tracks || []).map(trackCard).join('');
    return (
      '<div style="display:flex; flex-direction:column; gap:20px;">' +
        '<h2 style="font-family:\'Zilla Slab\', serif; font-weight:700; font-size:22px; margin:0; text-align:center;">' + escapeHtml(month.monthLabel || month.month) + '</h2>' +
        '<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:18px;">' + cards + '</div>' +
      '</div>'
    );
  }

  async function loadArchive() {
    const container = $('archiveList');
    if (!container) return;

    let months;
    try {
      const res = await fetch('spins-archive.json', { cache: 'no-store' });
      months = res.ok ? await res.json() : [];
    } catch (e) {
      months = [];
    }

    if (!months || !months.length) {
      container.innerHTML =
        '<p style="text-align:center; font-size:15px; color:rgba(56,42,30,0.65); max-width:520px; margin:0 auto;">' +
        'Nothing archived yet — the first month gets filed away here once This Month\'s Spins moves on to the next one. Check back after the month changes.' +
        '</p>';
      return;
    }

    container.innerHTML = months.map(monthSection).join('');
  }

  document.addEventListener('DOMContentLoaded', loadArchive);
})();
