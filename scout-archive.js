// EarDrumsPop — Scout Archive
//
// scout.html is the source of truth — it keeps the full running list of
// every artist Erik has ever added, newest first, and nothing ever gets
// removed from it. This page doesn't duplicate that content into a
// separate data file (which would just be one more place to keep in
// sync); instead it fetches scout.html itself, reads each <article
// data-added="YYYY-MM">, and groups them by month. That means adding a
// new Scout entry to scout.html is the only upkeep this archive ever
// needs — as long as the new <article> has an id and a data-added
// attribute (see the comment above the scout profiles section in
// scout.html), it shows up here automatically.

(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function monthLabelFor(monthKey) {
    const parts = monthKey.split('-');
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const name = MONTH_NAMES[monthIndex];
    return name ? (name + ' ' + year) : monthKey;
  }

  // Pulls "Beirut → Paris" out of a location span whose full text reads
  // "Beirut → Paris · Added Sep 2026" — everything before " · Added".
  function locationFrom(text) {
    if (!text) return '';
    const idx = text.indexOf(' · Added');
    return idx === -1 ? text.trim() : text.slice(0, idx).trim();
  }

  function parseScoutEntries(doc) {
    const articles = doc.querySelectorAll('article[data-added]');
    const entries = [];
    articles.forEach(function (article) {
      const id = article.getAttribute('id');
      const month = article.getAttribute('data-added');
      if (!id || !month) return;
      const heading = article.querySelector('h2');
      // The location text sits in a <span> next to the <h2>, inside the
      // same wrapper <div> — the only div>span pairing in the article
      // (the links row at the bottom is a div of <a> tags, no spans).
      const locationSpan = article.querySelector('div > span');
      entries.push({
        id: id,
        month: month,
        name: heading ? heading.textContent.trim() : id,
        location: locationSpan ? locationFrom(locationSpan.textContent) : ''
      });
    });
    return entries;
  }

  function groupByMonth(entries) {
    const byMonth = {};
    entries.forEach(function (entry) {
      if (!byMonth[entry.month]) byMonth[entry.month] = [];
      byMonth[entry.month].push(entry);
    });
    return Object.keys(byMonth)
      .sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; }) // newest month first
      .map(function (month) { return { month: month, entries: byMonth[month] }; });
  }

  function monthSection(group) {
    const items = group.entries.map(function (entry) {
      return (
        '<a href="scout.html#' + encodeURIComponent(entry.id) + '" ' +
        'style="display:flex; align-items:baseline; justify-content:space-between; gap:16px; padding:16px 20px; background:#fffaf0; border:1.5px solid rgba(56,42,30,0.14); border-radius:6px;">' +
          '<span style="font-family:\'Zilla Slab\', serif; font-weight:700; font-size:16px;">' + escapeHtml(entry.name) + '</span>' +
          (entry.location ? '<span style="font-size:13px; color:rgba(56,42,30,0.55); white-space:nowrap;">' + escapeHtml(entry.location) + '</span>' : '') +
        '</a>'
      );
    }).join('');

    return (
      '<div style="display:flex; flex-direction:column; gap:14px;">' +
        '<h2 style="font-family:\'Zilla Slab\', serif; font-weight:700; font-size:20px; margin:0;">' + escapeHtml(monthLabelFor(group.month)) + '</h2>' +
        '<div style="display:flex; flex-direction:column; gap:10px;">' + items + '</div>' +
      '</div>'
    );
  }

  async function loadArchive() {
    const container = $('archiveList');
    if (!container) return;

    let entries = [];
    try {
      const res = await fetch('scout.html', { cache: 'no-store' });
      if (res.ok) {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        entries = parseScoutEntries(doc);
      }
    } catch (e) {
      entries = [];
    }

    if (!entries.length) {
      container.innerHTML =
        '<p style="text-align:center; font-size:15px; color:rgba(56,42,30,0.65);">Couldn\'t load the Scout list right now — try again in a moment.</p>';
      return;
    }

    const groups = groupByMonth(entries);
    container.innerHTML = groups.map(monthSection).join('');
  }

  document.addEventListener('DOMContentLoaded', loadArchive);
})();
