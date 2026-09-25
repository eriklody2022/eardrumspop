// EarDrumsPop — update-spin.js
//
// Refreshes weekly-spins.json with the current tracks from Erik's public
// "This Week's Spins" Spotify playlist. Run on a schedule by
// .github/workflows/update-spin.yml, and any time Erik triggers it
// manually after updating the playlist.
//
// Spotify's app-only auth (Client Credentials) turned out to be blocked
// from reading playlist tracks — it returns 403 Forbidden even for public
// playlists, a restriction Spotify tightened a while back. So this uses
// the same refresh-token flow as the original Today's Spin feature
// instead: no scope needed beyond what was already authorized, since
// reading a public playlist doesn't require any special permission once
// you're using a real user token. Three environment variables, set as
// GitHub repo secrets and passed in by the workflow — never hardcoded
// here, never committed anywhere:
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REFRESH_TOKEN
//
// Only the finished result (up to 5 tracks: title, artist, album art URL,
// Spotify link) gets written to weekly-spins.json and committed — that
// file is public once the site is live, by design. The credentials above
// never are.

const fs = require('fs');

// Set this to your playlist's ID. Find it from the playlist's Spotify
// share link: open the playlist -> Share -> Copy link to playlist. The
// link looks like https://open.spotify.com/playlist/XXXXXXXXXXXX?si=...
// — the ID is the part between /playlist/ and the ?. Not sensitive, fine
// to commit as plain text.
const PLAYLIST_ID = '6u455r6dUFNri49T7opctR';

// How many tracks to show on the site, most recently added first.
const HOW_MANY = 5;

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

function trackToSpin(item) {
  const track = item.track;
  const artists = (track.artists || []).map(function (a) { return a.name; }).join(', ');
  const album = track.album || {};
  const image = (album.images && album.images[0]) ? album.images[0].url : null;
  return {
    title: track.name,
    artist: artists,
    albumArt: image,
    url: track.external_urls ? track.external_urls.spotify : null,
    addedAt: item.added_at
  };
}

async function main() {
  if (!PLAYLIST_ID || PLAYLIST_ID === 'REPLACE_WITH_YOUR_PLAYLIST_ID') {
    throw new Error("Set PLAYLIST_ID at the top of scripts/update-spin.js to your playlist's ID first.");
  }

  const accessToken = await getAccessToken();
  const authHeader = { 'Authorization': 'Bearer ' + accessToken };

  const url = 'https://api.spotify.com/v1/playlists/' + PLAYLIST_ID +
    '/tracks?fields=items(added_at,track(name,artists(name),album(images),external_urls))&limit=50';
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) {
    throw new Error('Failed to fetch playlist tracks: ' + res.status + ' ' + (await res.text()));
  }
  const data = await res.json();
  const items = (data.items || []).filter(function (item) { return item && item.track; });

  // Most recently added to the playlist first, capped at HOW_MANY — this
  // way it doesn't matter if Erik leaves extra tracks in the playlist or
  // reorders them by hand.
  items.sort(function (a, b) { return new Date(b.added_at) - new Date(a.added_at); });
  const spins = items.slice(0, HOW_MANY).map(trackToSpin);

  if (!spins.length) {
    console.log('Playlist has no tracks — leaving weekly-spins.json unchanged.');
    return;
  }

  fs.writeFileSync('weekly-spins.json', JSON.stringify({
    updatedAt: new Date().toISOString(),
    tracks: spins
  }, null, 2) + '\n');

  console.log('Updated weekly-spins.json with', spins.length, 'track(s).');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
