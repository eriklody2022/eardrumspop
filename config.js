// EarDrumsPop — configuration
//
// This is your Ticketmaster Discovery API key (the "Consumer Key" from
// developer.ticketmaster.com). It's used directly from the browser on
// purpose — Ticketmaster's own Discovery API tutorial does the exact same
// thing, since Discovery is a public, read-only, CORS-enabled API meant to
// be called client-side. There's no Consumer Secret involved here; that's
// only needed for their OAuth-based Commerce APIs, which EarDrumsPop
// doesn't use.
//
// Because this file ships to a public GitHub repo, this key is visible to
// anyone who looks at the page source — that's expected and fine for how
// this API is designed to be used. The only real risk is someone hammering
// it and burning through the free 5,000-calls/day quota; the caching in
// app.js (permanent for zip lookups and artist IDs) keeps normal usage well
// under that. If the key ever gets abused, regenerate it from
// developer.ticketmaster.com and swap the value below.

window.TICKETMASTER_API_KEY = "1M0GK4KuTJFbmU6DVTn0bkxTf1gCOBYB";
