// EarDrumsPop — concert matcher
//
// Flow: zip code -> lat/long (zippopotam.us, cached forever per zip) ->
// for each artist chip, resolve a Ticketmaster "attraction" ID (cached
// forever per artist name) -> search events near that lat/long for each
// attraction ID and/or the selected genre -> merge, dedupe, sort by date.
//
// Everything here runs client-side and caches into localStorage, per-visitor.
// That's a real limitation worth knowing: it doesn't share a cache across
// everyone the way a backend would, so it doesn't cut down on the total
// number of calls the way the original technical notes describe. It DOES
// mean a given visitor's repeat searches (same zip, same artists) stay fast
// and don't re-spend quota. If usage ever grows enough to need a shared
// cache, that's the point to add a small backend.

(function () {
  // Ticketmaster's genre/classification names aren't identical to the
  // labels on the pills — this is a best-effort mapping. If a genre search
  // comes back thin or off-base, this is the first place to adjust.
  const GENRE_MAP = {
    'Indie & Alternative': 'Alternative',
    'Rock': 'Rock',
    'Country': 'Country',
    'Hip-Hop': 'Hip-Hop/Rap',
    'Folk': 'Folk',
    'Metal': 'Metal',
    'Electronic': 'Electronic',
    'Jazz': 'Jazz'
  };

  // Fallback used only if the radius input is missing, empty, or invalid —
  // the input itself defaults to 75 in the HTML, so this is a last resort.
  const DEFAULT_RADIUS_MILES = 75;
  const MIN_RADIUS_MILES = 5;
  const MAX_RADIUS_MILES = 500;

  const state = {
    artists: ['Fleet Foxes', 'Tyler Childers', 'boygenius'],
    genre: 'Indie & Alternative'
  };

  const els = {};

  function $(id) { return document.getElementById(id); }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      if (parsed.expires && Date.now() > parsed.expires) {
        localStorage.removeItem(key);
        return undefined;
      }
      return parsed.value;
    } catch (e) {
      return undefined;
    }
  }

  function cacheSet(key, value, ttlMs) {
    try {
      localStorage.setItem(key, JSON.stringify({ value: value, expires: ttlMs ? Date.now() + ttlMs : null }));
    } catch (e) {
      // localStorage unavailable (private browsing, quota full, etc) — fine, just skip caching.
    }
  }

  async function geocodeZip(zip) {
    const cacheKey = 'edp_geo_' + zip;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const res = await fetch('https://api.zippopotam.us/us/' + encodeURIComponent(zip));
    if (!res.ok) throw new Error("Couldn't find that zip code — double check it and try again.");
    const data = await res.json();
    const place = data.places && data.places[0];
    if (!place) throw new Error("Couldn't find that zip code — double check it and try again.");

    const coords = {
      lat: place.latitude,
      lon: place.longitude,
      city: place['place name'],
      state: place['state abbreviation']
    };
    cacheSet(cacheKey, coords, null); // a zip's coordinates never change
    return coords;
  }

  async function resolveAttraction(artistName) {
    const cacheKey = 'edp_attraction_' + artistName.trim().toLowerCase();
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const url = 'https://app.ticketmaster.com/discovery/v2/attractions.json?apikey=' +
      encodeURIComponent(TICKETMASTER_API_KEY) + '&keyword=' + encodeURIComponent(artistName) + '&size=1';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Ticketmaster lookup failed for ' + artistName + '.');
    const data = await res.json();
    const attraction = data._embedded && data._embedded.attractions && data._embedded.attractions[0];
    const result = attraction ? { id: attraction.id, name: attraction.name } : null;
    cacheSet(cacheKey, result, null); // an artist's attraction ID doesn't change
    return result;
  }

  async function searchEvents(params) {
    const url = 'https://app.ticketmaster.com/discovery/v2/events.json?apikey=' +
      encodeURIComponent(TICKETMASTER_API_KEY) + '&' + new URLSearchParams(params).toString();
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) throw new Error("Ticketmaster rejected the API key — it may not be active yet (new keys can take a few minutes) or may need to be regenerated.");
      throw new Error('Ticketmaster search failed (status ' + res.status + ').');
    }
    const data = await res.json();
    return (data._embedded && data._embedded.events) || [];
  }

  function getRadiusMiles() {
    const raw = els.radiusInput ? parseInt(els.radiusInput.value, 10) : NaN;
    if (isNaN(raw)) return DEFAULT_RADIUS_MILES;
    return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, raw));
  }

  function renderChips() {
    els.artistChips.innerHTML = '';
    state.artists.forEach(function (name, i) {
      const chip = document.createElement('div');
      chip.style.cssText = 'display:flex; align-items:center; gap:8px; padding:9px 8px 9px 16px; border-radius:999px; background:rgba(193,80,46,0.09); border:1px solid rgba(193,80,46,0.25); font-size:14px; font-weight:600;';
      chip.textContent = name;

      const x = document.createElement('span');
      x.textContent = '×';
      x.setAttribute('aria-label', 'Remove ' + name);
      x.style.cssText = 'width:20px; height:20px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:14px; color:rgba(56,42,30,0.5); cursor:pointer;';
      x.addEventListener('click', function () {
        state.artists.splice(i, 1);
        renderChips();
      });

      chip.appendChild(x);
      els.artistChips.appendChild(chip);
    });
  }

  function addArtistFromInput() {
    const val = els.artistInput.value.trim();
    if (!val) return;
    const exists = state.artists.some(function (a) { return a.toLowerCase() === val.toLowerCase(); });
    if (!exists) state.artists.push(val);
    els.artistInput.value = '';
    renderChips();
  }

  function renderGenrePills() {
    const pills = els.genreChips.querySelectorAll('[data-genre]');
    pills.forEach(function (pill) {
      const selected = pill.dataset.genre === state.genre;
      pill.style.background = selected ? '#c1502e' : '#fff';
      pill.style.color = selected ? '#fffaf0' : '#382a1e';
      pill.style.borderColor = selected ? '#c1502e' : 'rgba(56,42,30,0.22)';
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDate(localDate, localTime) {
    if (!localDate) return 'Date to be announced';
    const d = new Date(localDate + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (!localTime) return dateStr;
    const [h, m] = localTime.split(':');
    const t = new Date();
    t.setHours(parseInt(h, 10), parseInt(m, 10));
    return dateStr + ' · ' + t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function renderResults(events, radiusMiles) {
    els.resultsList.innerHTML = '';
    if (!events.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:15px; color:rgba(56,42,30,0.7); margin:0;';
      empty.textContent = 'No shows found within ' + radiusMiles + ' miles right now. Try a different zip code, a wider radius, add another artist, or check back later.';
      els.resultsList.appendChild(empty);
      return;
    }
    events.forEach(function (ev) {
      const venue = ev._embedded && ev._embedded.venues && ev._embedded.venues[0];
      const start = ev.dates && ev.dates.start;
      const venueLine = venue ? (venue.name + (venue.city ? ', ' + venue.city.name : '')) : '';

      const card = document.createElement('div');
      card.style.cssText = 'background:#fffaf0; border:1.5px solid rgba(56,42,30,0.14); border-radius:6px; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap;';
      card.innerHTML =
        '<div>' +
          '<div style="font-family:\'Zilla Slab\', serif; font-weight:700; font-size:18px;">' + escapeHtml(ev.name) + '</div>' +
          '<div style="font-size:14px; color:rgba(56,42,30,0.68); margin-top:4px;">' +
            escapeHtml(formatDate(start && start.localDate, start && start.localTime)) +
            (venueLine ? ' · ' + escapeHtml(venueLine) : '') +
          '</div>' +
        '</div>' +
        '<a href="' + encodeURI(ev.url || '#') + '" target="_blank" rel="noopener" style="padding:10px 22px; border-radius:6px; background:#c1502e; color:#fffaf0; font-weight:700; font-size:14px; white-space:nowrap; text-decoration:none;">See tickets</a>';
      els.resultsList.appendChild(card);
    });
  }

  function setStatus(message, isError) {
    els.status.textContent = message || '';
    els.status.style.color = isError ? '#b3261e' : 'rgba(56,42,30,0.62)';
  }

  async function runSearch() {
    const zip = els.zipInput.value.trim();
    if (!/^\d{5}$/.test(zip)) {
      setStatus('Enter a valid 5-digit zip code.', true);
      return;
    }
    if (!window.TICKETMASTER_API_KEY) {
      setStatus("Search isn't configured yet — missing a Ticketmaster API key.", true);
      return;
    }

    const radiusMiles = getRadiusMiles();
    if (els.radiusInput) els.radiusInput.value = String(radiusMiles); // reflect any clamping back in the field

    els.resultsSection.style.display = 'block';
    els.resultsList.innerHTML = '';
    els.findBtn.disabled = true;
    setStatus('Looking for shows near you…');

    try {
      const geo = await geocodeZip(zip);
      const eventMap = new Map();

      for (const artistName of state.artists) {
        try {
          const attraction = await resolveAttraction(artistName);
          if (attraction) {
            const events = await searchEvents({
              attractionId: attraction.id,
              latlong: geo.lat + ',' + geo.lon,
              radius: String(radiusMiles),
              unit: 'miles',
              sort: 'date,asc',
              size: '10'
            });
            events.forEach(function (ev) { eventMap.set(ev.id, ev); });
          }
        } catch (innerErr) {
          console.warn('Search failed for artist "' + artistName + '":', innerErr);
        }
      }

      if (state.genre && GENRE_MAP[state.genre]) {
        try {
          const events = await searchEvents({
            classificationName: GENRE_MAP[state.genre],
            latlong: geo.lat + ',' + geo.lon,
            radius: String(radiusMiles),
            unit: 'miles',
            sort: 'date,asc',
            size: '15'
          });
          events.forEach(function (ev) { eventMap.set(ev.id, ev); });
        } catch (innerErr) {
          console.warn('Genre search failed:', innerErr);
        }
      }

      const events = Array.from(eventMap.values()).sort(function (a, b) {
        const da = (a.dates && a.dates.start && a.dates.start.localDate) || '9999-99-99';
        const db = (b.dates && b.dates.start && b.dates.start.localDate) || '9999-99-99';
        return da < db ? -1 : da > db ? 1 : 0;
      });

      const nearText = geo.city ? (geo.city + (geo.state ? ', ' + geo.state : '')) : zip;
      setStatus(
        events.length
          ? ('Showing ' + events.length + ' upcoming show' + (events.length === 1 ? '' : 's') + ' within ' + radiusMiles + ' miles of ' + nearText + '.')
          : ('No shows found within ' + radiusMiles + ' miles of ' + nearText + ' right now.')
      );
      renderResults(events, radiusMiles);
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Something went wrong. Try again in a moment.', true);
      els.resultsList.innerHTML = '';
    } finally {
      els.findBtn.disabled = false;
    }
  }

  function init() {
    els.zipInput = $('zipInput');
    els.radiusInput = $('radiusInput');
    els.artistInput = $('artistInput');
    els.addArtistBtn = $('addArtistBtn');
    els.artistChips = $('artistChips');
    els.genreChips = $('genreChips');
    els.findBtn = $('findShowsBtn');
    els.status = $('searchStatus');
    els.resultsSection = $('resultsSection');
    els.resultsList = $('resultsList');

    renderChips();
    renderGenrePills();

    els.addArtistBtn.addEventListener('click', addArtistFromInput);
    els.artistInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addArtistFromInput(); }
    });

    els.genreChips.querySelectorAll('[data-genre]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        state.genre = (state.genre === pill.dataset.genre) ? null : pill.dataset.genre;
        renderGenrePills();
      });
    });

    els.findBtn.addEventListener('click', runSearch);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
