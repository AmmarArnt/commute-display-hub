'use strict';
const { transit_realtime: rt } = require('gtfs-realtime-bindings');

const TRIP_CANCELED = rt.TripDescriptor.ScheduleRelationship.CANCELED;
const TRIP_DELETED = rt.TripDescriptor.ScheduleRelationship.DELETED;
const STOP_SKIPPED = rt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED;
const STOP_NO_DATA = rt.TripUpdate.StopTimeUpdate.ScheduleRelationship.NO_DATA;

// protobufjs puts defaults on the prototype for unset optional fields, so presence must be
// tested with hasOwnProperty. Int64 values may arrive as Long objects.
const has = (o, k) => o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k);
const num = (v) => (v === null || v === undefined ? null : (typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : Number(v)));

function decodeFeed(buffer) {
    return rt.FeedMessage.decode(buffer);
}

function feedTimestamp(feed) {
    return feed.header && has(feed.header, 'timestamp') ? num(feed.header.timestamp) : null;
}

// Index TripUpdates by trip_id. If tripIds is given, only those trips are kept.
// Returns { byTrip: Map, total: number (all trip updates in the feed) }.
function indexTripUpdates(feed, tripIds) {
    const byTrip = new Map();
    let total = 0;
    for (const e of feed.entity || []) {
        const tu = e.tripUpdate;
        if (!tu || !tu.trip) continue;
        total++;
        const tripId = tu.trip.tripId;
        if (!tripId || (tripIds && !tripIds.has(tripId))) continue;

        const rel = has(tu.trip, 'scheduleRelationship') ? tu.trip.scheduleRelationship : 0;
        const updates = [];
        for (const u of tu.stopTimeUpdate || []) {
            const arr = has(u, 'arrival') ? u.arrival : null;
            const dep = has(u, 'departure') ? u.departure : null;
            const urel = has(u, 'scheduleRelationship') ? u.scheduleRelationship : 0;
            updates.push({
                stopSequence: has(u, 'stopSequence') ? num(u.stopSequence) : null,
                stopId: has(u, 'stopId') ? u.stopId : null,
                arrTime: arr && has(arr, 'time') ? num(arr.time) : null,
                arrDelay: arr && has(arr, 'delay') ? num(arr.delay) : null,
                depTime: dep && has(dep, 'time') ? num(dep.time) : null,
                depDelay: dep && has(dep, 'delay') ? num(dep.delay) : null,
                skipped: urel === STOP_SKIPPED,
                noData: urel === STOP_NO_DATA
            });
        }
        byTrip.set(tripId, {
            canceled: rel === TRIP_CANCELED || rel === TRIP_DELETED,
            startDate: has(tu.trip, 'startDate') ? tu.trip.startDate : '',
            tripDelay: has(tu, 'delay') ? num(tu.delay) : null,
            updates
        });
    }
    return { byTrip, total };
}

module.exports = { decodeFeed, feedTimestamp, indexTripUpdates, has, num, rt };
