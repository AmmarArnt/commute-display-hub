'use strict';
const fs = require('fs');
const { nextDepartures } = require('./departures');
const { localDateString, DEFAULT_TZ } = require('./time');
const { RealtimePoller } = require('./poller');

function loadSchedule(path) {
    let raw;
    try {
        raw = fs.readFileSync(path, 'utf8');
    } catch (e) {
        throw new Error(`GTFS schedule not found at ${path}. Build it first: yarn gtfs:update (see README).`);
    }
    const slice = JSON.parse(raw);
    if (!slice || slice.version !== 1 || !slice.trips || !slice.services) {
        throw new Error(`GTFS schedule at ${path} has an unexpected format. Rebuild it with yarn gtfs:update.`);
    }
    return slice;
}

// Last date any service in the schedule runs (YYYYMMDD), or null if unknown.
function scheduleValidUntil(slice) {
    let max = null;
    for (const svc of Object.values(slice.services)) {
        const ends = [svc.calendar && svc.calendar.end, ...(svc.exceptions || []).filter((e) => e.type === 1).map((e) => e.date)];
        for (const d of ends) if (d && (!max || d > max)) max = d;
    }
    return max;
}

/**
 * Serves the same output as the SL Transport API path in server.js: an array of strings like
 * "134 Östbergahöjden 3 min". Only departures from the configured stop(s) are considered.
 * The destination shown is `label` (what SL shows on the bus), not the timetable's final stop name.
 */
class GtfsService {
    constructor({ schedulePath, label, departuresToShow, poller, now = Date.now, tz = DEFAULT_TZ }) {
        this.slice = loadSchedule(schedulePath);
        this.label = label;
        this.count = departuresToShow;
        this.poller = poller;
        this.now = now;
        this.tz = tz;
        this.validUntil = scheduleValidUntil(this.slice);
        if (this.validUntil && this.validUntil < localDateString(this.now(), tz)) {
            console.warn(`(GTFS) Schedule expired on ${this.validUntil}. Run yarn gtfs:update.`);
        }
    }

    static create(gtfsConfig, filterConfig) {
        const slice = loadSchedule(gtfsConfig.schedulePath);
        const poller = new RealtimePoller({
            url: gtfsConfig.realtimeUrl,
            apiKey: gtfsConfig.realtimeKey,
            tripIds: new Set(Object.keys(slice.trips)),
            intervalMs: gtfsConfig.pollIntervalMs,
            maxStaleMs: gtfsConfig.maxStaleMs,
            idleMs: gtfsConfig.idleMs
        });
        const service = new GtfsService({
            schedulePath: gtfsConfig.schedulePath,
            label: filterConfig.destinationName,
            departuresToShow: filterConfig.departuresToShow,
            poller
        });
        poller.start();
        return service;
    }

    // Returns { departures: string[], source: 'gtfs-realtime' | 'gtfs-schedule' }
    getDepartures() {
        this.poller.touch();
        const snap = this.poller.snapshot();
        const list = nextDepartures(this.slice, snap.byTrip, this.now(), { count: this.count, tz: this.tz });
        const departures = list.map((d) => `${this.slice.line} ${this.label} ${d.displayTime}`);
        const live = list.some((d) => d.realtime);
        return { departures, source: snap.byTrip && live ? 'gtfs-realtime' : 'gtfs-schedule' };
    }

    health() {
        const snap = this.poller.snapshot();
        const today = localDateString(this.now(), this.tz);
        return {
            dataSource: 'gtfs',
            realtime: {
                usable: snap.byTrip !== null,
                stale: snap.stale,
                ageSeconds: snap.ageMs === null ? null : Math.round(snap.ageMs / 1000),
                feedAgeSeconds: snap.feedAgeMs === null ? null : Math.round(snap.feedAgeMs / 1000),
                consecutiveFailures: snap.consecutiveFailures,
                lastError: snap.lastError ? { message: snap.lastError.message, status: snap.lastError.status } : null
            },
            schedule: {
                line: this.slice.line,
                trips: Object.keys(this.slice.trips).length,
                builtAt: this.slice.builtAt,
                validUntil: this.validUntil,
                expired: this.validUntil !== null && this.validUntil < today
            }
        };
    }

    stop() {
        this.poller.stop();
    }
}

module.exports = { GtfsService, loadSchedule, scheduleValidUntil };
