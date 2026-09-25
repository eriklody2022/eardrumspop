// EarDrumsPop — update-spin.js
//
// Refreshes today-spin.json with Erik's current (or most recently played)
// Spotify track. Run on a schedule by .github/workflows/update-spin.yml.
//
// Needs three environment variables, set as GitHub repo secrets and passed
// in by the workflow — never hardcoded here, never committed anywhere:
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REFRESH_TOKEN
//
// Only the finished result (song title, artist, album art URL, a Spotify
// link, and a timestamp) gets written to today-spin.json and committed —
// that file is public once the site is live, by design. The credentials
// above never are.

const fs = require('fs');

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

function trackToSpin(track, isPlaying) {
  const artists = (track.artists || []).map(function (a) { return a.name; }).join(', ');
  const album = track.album || {};
  const image = (album.images && album.images[0]) ? album.images[0].url : null;
  return {
    isPlaying: !!isPlaying,
    title: track.name,
    artist: artists,
    albumArt: image,
    url: track.external_urls ? track.external_urls.spotify : null,
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  const accessToken = await getAccessToken();
  const authHeader = { 'Authorization': 'Bearer ' + accessToken };

  let spin = null;

  // Try what's playing right now first.
  const currentRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: authHeader });
  if (currentRes.status === 200) {
    const data = await currentRes.json();
    if (data && data.item) {
      spin = trackToSpin(data.item, data.is_playing);
    }
  } else if (currentRes.status !== 204) {
    console.warn('currently-playing returned', currentRes.status, await currentRes.text());
  }

  // Nothing playing right now — fall back to the most recently played track.
  if (!spin) {
    const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', { headers: authHeader });
    if (!recentRes.ok) {
      throw new Error('Failed to fetch recently played: ' + recentRes.status + ' ' + (await recentRes.text()));
    }
    const data = await recentRes.json();
    const item = data.items && data.items[0] && data.items[0].track;
    if (item) spin = trackToSpin(item, false);
  }

  if (!spin) {
    console.log('No current or recent track found on Spotify — leaving today-spin.json unchanged.');
    return;
  }

  fs.writeFileSync('today-spin.json', JSON.stringify(spin, null, 2) + '\n');
  console.log('Updated today-spin.json:', spin.title, '—', spin.artist, spin.isPlaying ? '(now playing)' : '(recently played)');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
