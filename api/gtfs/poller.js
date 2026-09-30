'use strict';
const axios = require('axios');
const { decodeFeed, feedTimestamp, indexTripUpdates } = require('./realtime');

const DEFAULT_URL = 'https://opendata.samtrafiken.se/gtfs-rt/sl/TripUpdates.pb';

/**
 * Polls the GTFS Regional TripUpdates feed in the background, decoupled from client requests.
 *
 * - The feed is fetched at most once per `intervalMs`, no matter how many clients ask for departures.
 * - On failure it backs off exponentially (up to `maxBackoffMs`) and keeps serving the last good
 *   data (stale-while-error) until it is older than `maxStaleMs`; after that `snapshot()` reports
 *   no live data and callers fall back to the timetable.
 * - It only polls while somebody is using the API (`touch()` was called within `idleMs`), so a
 *   display that sleeps at night costs no requests.
 * - The API key is never logged.
 */
class RealtimePoller {
    constructor(opts) {
        this.url = opts.url || DEFAULT_URL;
        this.apiKey = opts.apiKey;
        this.tripIds = opts.tripIds; // Set of trip ids we care about; the rest of the feed is dropped
        this.intervalMs = opts.intervalMs || 60000;
        this.maxBackoffMs = opts.maxBackoffMs || 5 * 60000;
        this.maxStaleMs = opts.maxStaleMs || 10 * 60000;
        this.idleMs = opts.idleMs || 5 * 60000;
        this.timeoutMs = opts.timeoutMs || 10000;
        this.now = opts.now || Date.now;
        this.fetchBuffer = opts.fetchBuffer || ((url, key, timeoutMs) => defaultFetch(url, key, timeoutMs));
        this.log = opts.log || console;

        this.byTrip = null;
        this.feedTimestampMs = null;
        this.fetchedAt = null;
        this.lastError = null;
        this.consecutiveFailures = 0;
        this.lastTouch = 0;
        this.timer = null;
        this.polling = null;
        this.running = false;
    }

    start() {
        this.running = true;
        this.lastTouch = this.now();
        this._schedule(0);
    }

    stop() {
        this.running = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    // Called on every client request. Wakes the poller if it went idle.
    touch() {
        this.lastTouch = this.now();
        if (this.running && !this.timer && !this.polling) this._schedule(0);
    }

    _delay() {
        if (this.consecutiveFailures === 0) return this.intervalMs;
        return Math.min(this.maxBackoffMs, this.intervalMs * 2 ** this.consecutiveFailures);
    }

    _schedule(ms) {
        if (!this.running) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            this._tick();
        }, ms);
        if (this.timer.unref) this.timer.unref();
    }

    async _tick() {
        if (!this.running) return;
        if (this.now() - this.lastTouch > this.idleMs) return; // idle: sleep until touch()
        await this.pollOnce();
        this._schedule(this._delay());
    }

    pollOnce() {
        if (this.polling) return this.polling;
        this.polling = this._poll().finally(() => { this.polling = null; });
        return this.polling;
    }

    async _poll() {
        try {
            const { status, buffer } = await this.fetchBuffer(this.url, this.apiKey, this.timeoutMs);
            if (status !== 200) {
                const err = new Error(`HTTP ${status}`);
                err.status = status;
                throw err;
            }
            const feed = decodeFeed(buffer);
            const ts = feedTimestamp(feed);
            const { byTrip } = indexTripUpdates(feed, this.tripIds);
            this.byTrip = byTrip;
            this.feedTimestampMs = ts ? ts * 1000 : null;
            this.fetchedAt = this.now();
            if (this.consecutiveFailures > 0) this.log.log(`(GTFS-RT) Recovered after ${this.consecutiveFailures} failed poll(s).`);
            this.consecutiveFailures = 0;
            this.lastError = null;
            return true;
        } catch (e) {
            this.consecutiveFailures++;
            // Deliberately not logging the request URL/config: it contains the API key.
            this.lastError = { message: e.message, status: e.status || (e.response && e.response.status) || null, at: this.now() };
            this.log.error(`(GTFS-RT) Poll failed (${this.consecutiveFailures} in a row): ${e.message}. Next attempt in ${Math.round(this._delay() / 1000)} s.`);
            return false;
        }
    }

    // What callers should use right now. `byTrip` is null when there is no usable live data.
    snapshot() {
        const now = this.now();
        const ageMs = this.fetchedAt === null ? null : now - this.fetchedAt;
        const usable = this.byTrip !== null && ageMs !== null && ageMs <= this.maxStaleMs;
        return {
            byTrip: usable ? this.byTrip : null,
            ageMs,
            stale: this.byTrip !== null && !usable,
            feedAgeMs: this.feedTimestampMs === null ? null : now - this.feedTimestampMs,
            consecutiveFailures: this.consecutiveFailures,
            lastError: this.lastError
        };
    }
}

// The Samtrafiken gateway rejects requests without Accept-Encoding: gzip; axios sends it and decodes.
async function defaultFetch(url, key, timeoutMs) {
    const res = await axios.get(url, {
        params: { key },
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers: { 'Accept-Encoding': 'gzip, deflate', 'User-Agent': 'commute-display-hub' },
        validateStatus: () => true
    });
    return { status: res.status, buffer: Buffer.from(res.data) };
}

module.exports = { RealtimePoller, DEFAULT_URL };
