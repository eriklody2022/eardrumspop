// EarDrumsPop — update-spin.js
//
// Refreshes current-spins.json with the current tracks from Erik's public
// "This Month's Spins" Spotify playlist. Run monthly by
// .github/workflows/update-spin.yml, and any time Erik triggers it
// manually after updating the playlist (which he usually does right when
// he swaps the picks for a new month).
//
// Monthly rollover / archiving: before writing a fresh set of tracks,
// this checks whether current-spins.json already holds a *different*
// month than the one we're about to write. If so, that outgoing month's
// tracks get filed away into spins-archive.json first, so nothing is
// lost when the homepage moves on to the new month. This makes the
// archiving fully automatic — it doesn't matter whether this script runs
// via the monthly cron or because Erik triggered it by hand after editing
// the playlist; either way, a month boundary only gets crossed once, and
// the outgoing month is preserved before it's overwritten.
//
// Spotify's app-only auth (Client Credentials) turned out to be blocked
// from reading playlist tracks — it returns 403 Forbidden even for public
// playlists, a restriction Spotify tightened a while back. Reading a
// playlist's tracks also turns out to need the playlist-read-private
// scope on the user token even when the playlist itself is public, and
// the old /tracks endpoint is deprecated in favor of /items — so this
// uses the same refresh-token flow as the original Today's Spin feature,
// with a token authorized for that scope, against the current /items
// endpoint. One more wrinkle: the /items response nests each track under
// an `item` field, not the older `track` field (which the docs list as
// deprecated and which the endpoint doesn't actually populate) — see
// trackToSpin() below. Three environment variables, set as GitHub repo
// secrets and passed in by the workflow — never hardcoded here, never
// committed anywhere:
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REFRESH_TOKEN
//
// Only the finished result (up to 6 tracks: title, artist, album art URL,
// Spotify link) gets written to current-spins.json / spins-archive.json
// and committed — those files are public once the site is live, by
// design. The credentials above never are.

const fs = require('fs');

// Set this to your playlist's ID. Find it from the playlist's Spotify
// share link: open the playlist -> Share -> Copy link to playlist. The
// link looks like https://open.spotify.com/playlist/XXXXXXXXXXXX?si=...
// — the ID is the part between /playlist/ and the ?. Not sensitive, fine
// to commit as plain text.
const PLAYLIST_ID = '6u455r6dUFNri49T7opctR';

// How many tracks to show on the site, most recently added first.
const HOW_MANY = 6;

const CURRENT_FILE = 'current-spins.json';
const ARCHIVE_FILE = 'spins-archive.json';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Month keys are computed in UTC, same as the cron schedule that runs
// this script — so the rollover happens right around midnight UTC on the
// 1st, not midnight in Erik's own timezone. Close enough for a monthly
// feature; not worth the complexity of threading a timezone through a
// GitHub Actions runner for it.
function monthKey(date) {
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}

function monthLabel(date) {
  return MONTH_NAMES[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
}

async function getAccessToken() {
  const basicAuth = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + basicAuth
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN
    })
  });

  if (!res.ok) {
    throw new Error('Failed to refresh Spotify access token: ' + res.status + ' ' + (await res.text()));
  }
  const data = await res.json();
  return data.access_token;
}

function trackToSpin(entry) {
  // The /items endpoint's response nests the actual track/episode data
  // under `item`, not the older, deprecated `track` field (which the
  // endpoint doesn't actually populate) — see main() below.
  const track = entry.item;
  const artists = (track.artists || []).map(function (a) { return a.name; }).join(', ');
  const album = track.album || {};
  const image = (album.images && album.images[0]) ? album.images[0].url : null;
  return {
    title: track.name,
    artist: artists,
    albumArt: image,
    url: track.external_urls ? track.external_urls.spotify : null,
    addedAt: entry.added_at
  };
}

function readJsonSafe(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    return null; // missing file, first run, or unreadable — treat as absent
  }
}

// If current-spins.json holds a real, different month than the one we're
// about to write, file its tracks away into spins-archive.json (newest
// month first) before it gets overwritten. Safe to call more than once
// across a month boundary — it won't archive the same month twice.
function archiveOutgoingMonthIfNeeded(currentMonth, now) {
  const existing = readJsonSafe(CURRENT_FILE);
  if (!existing || !existing.month || existing.month === currentMonth) return;
  if (!existing.tracks || !existing.tracks.length) return;

  const archive = readJsonSafe(ARCHIVE_FILE) || [];
  const alreadyArchived = archive.some(function (m) { return m.month === existing.month; });
  if (alreadyArchived) return;

  archive.unshift({
    month: existing.month,
    monthLabel: existing.monthLabel || existing.month,
    archivedAt: now.toISOString(),
    tracks: existing.tracks
  });
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2) + '\n');
  console.log('Archived ' + existing.month + ' (' + existing.tracks.length + ' track(s)) to ' + ARCHIVE_FILE + '.');
}

async function main() {
  if (!PLAYLIST_ID || PLAYLIST_ID === 'REPLACE_WITH_YOUR_PLAYLIST_ID') {
    throw new Error("Set PLAYLIST_ID at the top of scripts/update-spin.js to your playlist's ID first.");
  }

  const accessToken = await getAccessToken();
  const authHeader = { 'Authorization': 'Bearer ' + accessToken };

  // No `fields` filter here on purpose — keep it simple against the full
  // default response. The playlist is tiny, so there's no real cost to
  // the extra response size.
  const url = 'https://api.spotify.com/v1/playlists/' + PLAYLIST_ID +
    '/items?limit=50';
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) {
    throw new Error('Failed to fetch playlist tracks: ' + res.status + ' ' + (await res.text()));
  }
  const data = await res.json();
  // Each entry's track/episode data lives under `item`, not the older,
  // deprecated `track` field (which the /items endpoint doesn't actually
  // populate) — see trackToSpin() above.
  const items = (data.items || []).filter(function (entry) { return entry && entry.item; });

  // Most recently added to the playlist first, capped at HOW_MANY — this
  // way it doesn't matter if Erik leaves extra tracks in the playlist or
  // reorders them by hand.
  items.sort(function (a, b) { return new Date(b.added_at) - new Date(a.added_at); });
  const spins = items.slice(0, HOW_MANY).map(trackToSpin);

  if (!spins.length) {
    console.log('Playlist has no tracks — leaving ' + CURRENT_FILE + ' unchanged.');
    return;
  }

  const now = new Date();
  const currentMonth = monthKey(now);

  // Only archive once we know we have fresh tracks to replace it with —
  // never leave current-spins.json stale-but-unarchived, and never
  // archive a month without also writing what replaces it.
  archiveOutgoingMonthIfNeeded(currentMonth, now);

  fs.writeFileSync(CURRENT_FILE, JSON.stringify({
    month: currentMonth,
    monthLabel: monthLabel(now),
    updatedAt: now.toISOString(),
    tracks: spins
  }, null, 2) + '\n');

  console.log('Updated ' + CURRENT_FILE + ' with ' + spins.length + ' track(s) for ' + currentMonth + '.');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
