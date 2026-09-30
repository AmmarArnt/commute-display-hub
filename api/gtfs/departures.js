'use strict';
const { DEFAULT_TZ, localDateString, addDays, weekday, serviceDayBase } = require('./time');

// Which service_ids run on a service date ('YYYYMMDD')?
function activeServices(slice, dateStr) {
    const active = new Set();
    const dow = weekday(dateStr);
    for (const [sid, svc] of Object.entries(slice.services)) {
        let on = false;
        if (svc.calendar && svc.calendar.start <= dateStr && dateStr <= svc.calendar.end && svc.calendar.days[dow]) on = true;
        for (const ex of svc.exceptions) {
            if (ex.date !== dateStr) continue;
            if (ex.type === 1) on = true;
            if (ex.type === 2) on = false;
        }
        if (on) active.add(sid);
    }
    return active;
}

// Apply a TripUpdate to one scheduled stop time. Returns null if the stop is skipped,
// otherwise { ms, realtime, how } where "how" says which rule produced the time.
// `date` is the service date being evaluated: a TripUpdate names the service date it belongs to
// (trip.start_date), and the same trip_id runs on many dates, so it must only apply to that one.
function applyRealtime(rtTrip, st, scheduledMs, date) {
    if (!rtTrip) return { ms: scheduledMs, realtime: false, how: 'schedule' };
    if (rtTrip.startDate && date && rtTrip.startDate !== date) return { ms: scheduledMs, realtime: false, how: 'schedule' };

    const exact = rtTrip.updates.find((u) =>
        (u.stopSequence !== null && u.stopSequence === st.stop_sequence) ||
        (u.stopSequence === null && u.stopId === st.stop_id));

    if (exact) {
        if (exact.skipped) return null;
        if (!exact.noData) {
            if (exact.depTime !== null) return { ms: exact.depTime * 1000, realtime: true, how: 'exact-time' };
            if (exact.arrTime !== null) return { ms: exact.arrTime * 1000, realtime: true, how: 'exact-time' };
            const d = exact.depDelay !== null ? exact.depDelay : exact.arrDelay;
            if (d !== null) return { ms: scheduledMs + d * 1000, realtime: true, how: 'exact-delay' };
        }
    }

    // GTFS-RT: a delay carries forward to later stops until the next update.
    let prev = null;
    for (const u of rtTrip.updates) {
        if (u.stopSequence === null || u.stopSequence >= st.stop_sequence || u.noData) continue;
        const d = u.depDelay !== null ? u.depDelay : u.arrDelay;
        if (d === null) continue;
        if (!prev || u.stopSequence > prev.stopSequence) prev = { stopSequence: u.stopSequence, delay: d };
    }
    if (prev) return { ms: scheduledMs + prev.delay * 1000, realtime: true, how: 'propagated' };

    if (rtTrip.tripDelay !== null) return { ms: scheduledMs + rtTrip.tripDelay * 1000, realtime: true, how: 'trip-delay' };
    return { ms: scheduledMs, realtime: false, how: 'schedule' };
}

// Same rules as the current api/departureProcessor.js: past = dropped, <30 s = "Nu", else floor(min).
function formatWait(diffMs) {
    if (diffMs < 0) return null;
    if (diffMs < 30000) return 'Nu';
    return `${Math.floor(diffMs / 60000)} min`;
}

function nextDepartures(slice, rtByTrip, nowMs, opts = {}) {
    const { count = 3, tz = DEFAULT_TZ, horizonMs = 3 * 3600 * 1000 } = opts;
    const today = localDateString(nowMs, tz);
    const dates = [addDays(today, -1), today, addDays(today, 1)]; // yesterday covers times past 24:00
    const out = [];

    for (const date of dates) {
        const base = serviceDayBase(date, tz);
        const active = activeServices(slice, date);
        for (const [tripId, trip] of Object.entries(slice.trips)) {
            if (!active.has(trip.service_id)) continue;
            const rtTrip = rtByTrip ? rtByTrip.get(tripId) : undefined;
            if (rtTrip && rtTrip.canceled && (!rtTrip.startDate || rtTrip.startDate === date)) continue;
            for (const st of trip.stopTimes) {
                const scheduledMs = base + st.dep * 1000;
                const res = applyRealtime(rtTrip, st, scheduledMs, date);
                if (!res) continue;
                const diff = res.ms - nowMs;
                const wait = formatWait(diff);
                if (wait === null || diff > horizonMs) continue;
                out.push({
                    tripId,
                    date,
                    line: slice.line,
                    headsign: trip.headsign,
                    ms: res.ms,
                    scheduledMs,
                    delaySec: Math.round((res.ms - scheduledMs) / 1000),
                    realtime: res.realtime,
                    how: res.how,
                    displayTime: wait,
                    displayString: `${slice.line} ${trip.headsign} ${wait}`
                });
            }
        }
    }
    // Safety net for updates that do not name a service date: the same trip_id must not appear
    // once per candidate date with the same live time. Keep the date where the live time fits best.
    const bestRt = new Map();
    for (const d of out) {
        if (!d.realtime) continue;
        const cur = bestRt.get(d.tripId);
        if (!cur || Math.abs(d.delaySec) < Math.abs(cur.delaySec)) bestRt.set(d.tripId, d);
    }
    const deduped = out.filter((d) => !d.realtime || bestRt.get(d.tripId) === d);

    deduped.sort((a, b) => a.ms - b.ms);
    return deduped.slice(0, count);
}

module.exports = { activeServices, applyRealtime, formatWait, nextDepartures };
