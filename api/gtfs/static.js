'use strict';
const { parseGtfsTime } = require('./time');

const DAY_COLUMNS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const lc = (s) => String(s || '').toLowerCase();

// Find candidate stops by name substring and/or id substring.
// SL stop ids are not the same as SL Transport API site ids, so this is how you discover them.
async function findStops(stopsRows, { name, idContains } = {}) {
    const found = [];
    for await (const s of stopsRows) {
        const nameOk = name ? lc(s.stop_name).includes(lc(name)) : false;
        const idOk = idContains ? String(s.stop_id).includes(String(idContains)) : false;
        if (nameOk || idOk) {
            found.push({
                stop_id: s.stop_id,
                stop_name: s.stop_name,
                platform_code: s.platform_code || '',
                parent_station: s.parent_station || '',
                location_type: s.location_type || ''
            });
        }
    }
    return found;
}

// Builds a small in-memory slice of the static schedule: only the given line, optional headsign
// filter, and only the given stops. Tables are (async) iterables of row objects, consumed in order.
async function buildSlice(tables, { stopIds, line, headsign }) {
    const stopSet = new Set(stopIds);
    const lineStr = String(line);

    const routeIds = new Set();
    for await (const r of tables.routes) {
        if (String(r.route_short_name) === lineStr) routeIds.add(r.route_id);
    }

    const trips = {};
    for await (const t of tables.trips) {
        if (!routeIds.has(t.route_id)) continue;
        // Filter early only when the feed provides a headsign. SL leaves trip_headsign empty;
        // for those trips the destination is derived from the final stop further down.
        if (headsign && t.trip_headsign && !lc(t.trip_headsign).includes(lc(headsign))) continue;
        trips[t.trip_id] = {
            route_id: t.route_id,
            service_id: t.service_id,
            headsign: t.trip_headsign,
            direction_id: t.direction_id,
            stopTimes: []
        };
    }

    const last = {}; // trip_id -> final stop (highest stop_sequence)
    for await (const st of tables.stopTimes) {
        const trip = trips[st.trip_id];
        if (!trip) continue;
        const seq = Number(st.stop_sequence);
        if (!last[st.trip_id] || seq > last[st.trip_id].seq) last[st.trip_id] = { seq, stop_id: st.stop_id };
        if (!stopSet.has(st.stop_id)) continue;
        const arr = parseGtfsTime(st.arrival_time);
        const dep = parseGtfsTime(st.departure_time);
        if (arr === null && dep === null) continue;
        trip.stopTimes.push({
            stop_id: st.stop_id,
            stop_sequence: Number(st.stop_sequence),
            arr: arr === null ? dep : arr,
            dep: dep === null ? arr : dep
        });
    }

    for (const id of Object.keys(trips)) {
        if (trips[id].stopTimes.length === 0) { delete trips[id]; continue; }
    }

    // Derive destination names from each trip's final stop (needs the stops table).
    const names = {};
    if (tables.stops) {
        const needed = new Set(Object.keys(trips).map((id) => last[id] && last[id].stop_id).filter(Boolean));
        for await (const s of tables.stops) if (needed.has(s.stop_id)) names[s.stop_id] = s.stop_name;
    }
    for (const id of Object.keys(trips)) {
        const trip = trips[id];
        trip.lastStopId = last[id] ? last[id].stop_id : '';
        trip.destination = names[trip.lastStopId] || '';
        if (!trip.headsign) trip.headsign = trip.destination;
        if (headsign && !lc(trip.headsign).includes(lc(headsign))) delete trips[id];
    }

    const usedServices = new Set(Object.values(trips).map((t) => t.service_id));
    const services = {};
    for (const sid of usedServices) services[sid] = { calendar: null, exceptions: [] };

    for await (const c of tables.calendar || []) {
        if (!usedServices.has(c.service_id)) continue;
        services[c.service_id].calendar = {
            start: c.start_date,
            end: c.end_date,
            days: DAY_COLUMNS.map((d) => c[d] === '1')
        };
    }
    for await (const e of tables.calendarDates || []) {
        if (!usedServices.has(e.service_id)) continue;
        services[e.service_id].exceptions.push({ date: e.date, type: Number(e.exception_type) });
    }

    return {
        version: 1,
        builtAt: new Date().toISOString(),
        line: lineStr,
        headsign: headsign || '',
        stopIds: [...stopSet],
        trips,
        services
    };
}

module.exports = { findStops, buildSlice, DAY_COLUMNS };
