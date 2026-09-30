'use strict';
const assert = require('node:assert/strict');
const { zonedToEpoch } = require('../../gtfs/time');
const { findStops } = require('../../gtfs/static');
const { nextDepartures } = require('../../gtfs/departures');
const { fixtureSlice, feedBytes, indexed, STOPS, rt, tableRows, textLines } = require('./fixtures');

const at = (y, mo, d, h, mi, s) => zonedToEpoch(y, mo, d, h, mi, s);
const strings = (r) => r.map((x) => x.displayString);
const TRIP = rt.TripDescriptor.ScheduleRelationship;
const STOP = rt.TripUpdate.StopTimeUpdate.ScheduleRelationship;

test('static slice keeps only the wanted line, headsign and stop', async () => {
    const slice = await fixtureSlice();
    assert.deepEqual(Object.keys(slice.trips).sort(), ['t1', 't2', 't4']);
    assert.equal(slice.trips.t1.stopTimes.length, 1);
    assert.equal(slice.trips.t1.stopTimes[0].stop_id, 'S_B');
    assert.equal(slice.trips.t1.stopTimes[0].stop_sequence, 5);
    assert.deepEqual(Object.keys(slice.services).sort(), ['late', 'wk']);
});

test('blank trip_headsign (as in SL data): destination is derived from the final stop and can be filtered', async () => {
    const { buildSlice } = require('../../gtfs/static');
    const t = (txt) => tableRows(textLines(txt));
    const tables = () => ({
        routes: t('route_id,route_short_name\nr134,134\n'),
        trips: t('route_id,service_id,trip_id,trip_headsign,direction_id\nr134,wk,a,,0\nr134,wk,b,,0\nr134,wk,c,,1\n'),
        stopTimes: t('trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
            'a,10:00:00,10:00:00,S_B,5\na,10:09:00,10:09:00,S_OST,9\n' +   // a ends at Östbergahöjden
            'b,10:10:00,10:10:00,S_B,5\nb,10:20:00,10:20:00,S_JUL,12\n' + // b ends at Julitavägen
            'c,10:05:00,10:05:00,S_B,5\nc,10:15:00,10:15:00,S_LIL,11\n'), // c ends at Liljeholmen
        stops: t('stop_id,stop_name\nS_B,Årstaberg\nS_OST,Östbergahöjden\nS_JUL,Julitavägen\nS_LIL,Liljeholmen\n'),
        calendar: t('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,1,1,20260101,20261231\n'),
        calendarDates: []
    });
    const all = await buildSlice(tables(), { stopIds: ['S_B'], line: 134 });
    assert.deepEqual(Object.values(all.trips).map((x) => x.headsign).sort(), ['Julitavägen', 'Liljeholmen', 'Östbergahöjden']);
    assert.equal(all.trips.a.lastStopId, 'S_OST');
    const only = await buildSlice(tables(), { stopIds: ['S_B'], line: 134, headsign: 'östbergahöjden' });
    assert.deepEqual(Object.keys(only.trips), ['a']);
    const r = nextDepartures(only, null, at(2026, 9, 30, 9, 56, 30));
    assert.deepEqual(strings(r), ['134 Östbergahöjden 3 min']);
});

test('a trip that runs every day is listed once when live data arrives (no yesterday/tomorrow copies)', async () => {
    const { buildSlice } = require('../../gtfs/static');
    const t = (txt) => tableRows(textLines(txt));
    const slice = await buildSlice({
        routes: t('route_id,route_short_name\nr134,134\n'),
        trips: t('route_id,service_id,trip_id,trip_headsign,direction_id\nr134,all,x,Julitavägen,0\n'),
        stopTimes: t('trip_id,arrival_time,departure_time,stop_id,stop_sequence\nx,10:00:00,10:00:00,S_B,5\n'),
        calendar: t('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nall,1,1,1,1,1,1,1,20260101,20261231\n'),
        calendarDates: []
    }, { stopIds: ['S_B'], line: 134 });
    const now = at(2026, 9, 30, 9, 56, 30);
    const live = Math.floor(at(2026, 9, 30, 10, 3, 0) / 1000);
    for (const startDate of ['20260930', undefined]) { // with and without a named service date
        const trip = { tripId: 'x' }; if (startDate) trip.startDate = startDate;
        const bytes = feedBytes(Math.floor(now / 1000), [{ tripUpdate: { trip, stopTimeUpdate: [{ stopSequence: 5, departure: { time: live } }] } }]);
        const r = nextDepartures(slice, indexed(bytes).byTrip, now, { horizonMs: 30 * 3600 * 1000, count: 10 });
        const live134 = r.filter((d) => d.realtime);
        assert.equal(live134.length, 1, `startDate=${startDate}`);
        assert.equal(live134[0].delaySec, 180);
        assert.equal(live134[0].date, '20260930');
        assert.equal(live134[0].displayString, '134 Julitavägen 6 min');
    }
});

test('a cancellation only applies to the service date it names', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const tomorrowOnly = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1', startDate: '20261001', scheduleRelationship: TRIP.CANCELED } } }
    ]);
    assert.deepEqual(strings(nextDepartures(slice, indexed(tomorrowOnly).byTrip, now)), ['134 Östbergahöjden 3 min', '134 Östbergahöjden 13 min']);
    const today = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1', startDate: '20260930', scheduleRelationship: TRIP.CANCELED } } }
    ]);
    assert.deepEqual(strings(nextDepartures(slice, indexed(today).byTrip, now)), ['134 Östbergahöjden 13 min']);
});

test('findStops matches names with commas and reports platform codes', async () => {
    const found = await findStops(tableRows(textLines(STOPS)), { name: 'östbergahöjden' });
    assert.equal(found.length, 2);
    assert.deepEqual(found.map((s) => s.platform_code).sort(), ['A', 'B']);
});

test('schedule only: sorted, floored minutes, other line and headsign excluded', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const r = nextDepartures(slice, null, now);
    assert.deepEqual(strings(r), ['134 Östbergahöjden 3 min', '134 Östbergahöjden 13 min']);
    assert.ok(r.every((d) => d.realtime === false));
});

test('"Nu" when less than 30 seconds away, and past departures are dropped', async () => {
    const slice = await fixtureSlice();
    assert.equal(nextDepartures(slice, null, at(2026, 9, 30, 9, 59, 45))[0].displayTime, 'Nu');
    const after = nextDepartures(slice, null, at(2026, 9, 30, 10, 0, 1));
    assert.deepEqual(strings(after), ['134 Östbergahöjden 9 min']); // t1 gone, t2 at 10:10:00 is 9m59s away
});

test('times past 24:00 belong to the previous service day (midnight rollover)', async () => {
    const slice = await fixtureSlice();
    // 00:50 on Sep 30: t4 is scheduled 25:10 on service day Sep 29 = 01:10 => 20 min
    const r = nextDepartures(slice, null, at(2026, 9, 30, 0, 50, 0));
    assert.deepEqual(strings(r), ['134 Östbergahöjden 20 min']);
    assert.equal(r[0].date, '20260929');
});

test('calendar_dates: service removed on one day, added on another', async () => {
    const slice = await fixtureSlice();
    // Thu Oct 1 is removed for "wk" => no daytime departures
    assert.deepEqual(nextDepartures(slice, null, at(2026, 10, 1, 9, 56, 30)), []);
    // Sat Oct 3 is added for "wk" although the calendar says no Saturdays
    assert.equal(nextDepartures(slice, null, at(2026, 10, 3, 9, 56, 30)).length, 2);
});

test('realtime delay is applied (delay field), through real protobuf encode/decode', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const bytes = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 5, departure: { delay: 120 } }] } }
    ]);
    const { byTrip, total } = indexed(bytes, new Set(Object.keys(slice.trips)));
    assert.equal(total, 1);
    const r = nextDepartures(slice, byTrip, now);
    assert.equal(r[0].displayString, '134 Östbergahöjden 5 min'); // 10:02:00 - 09:56:30 = 5m30s
    assert.equal(r[0].delaySec, 120);
    assert.equal(r[0].realtime, true);
    assert.equal(r[0].how, 'exact-delay');
    assert.equal(r[1].realtime, false); // t2 has no realtime and stays on schedule
});

test('realtime absolute time wins over the schedule (int64 Long survives decode)', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const bytes = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 5, departure: { time: Math.floor(at(2026, 9, 30, 10, 3, 0) / 1000) } }] } }
    ]);
    const r = nextDepartures(slice, indexed(bytes).byTrip, now);
    assert.equal(r[0].displayString, '134 Östbergahöjden 6 min');
    assert.equal(r[0].how, 'exact-time');
});

test('update matched by stop_id when stop_sequence is absent', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const bytes = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopId: 'S_B', departure: { delay: 60 } }] } }
    ]);
    const r = nextDepartures(slice, indexed(bytes).byTrip, now);
    assert.equal(r[0].displayString, '134 Östbergahöjden 4 min');
    assert.equal(r[0].delaySec, 60);
});

test('delay from an earlier stop carries forward; later stops do not affect us', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const early = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 3, arrival: { delay: 300 } }] } }
    ]);
    const r1 = nextDepartures(slice, indexed(early).byTrip, now);
    assert.equal(r1[0].how, 'propagated');
    assert.equal(r1[0].delaySec, 300);
    assert.equal(r1[0].displayString, '134 Östbergahöjden 8 min');

    const later = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 6, arrival: { delay: 900 } }] } }
    ]);
    const r2 = nextDepartures(slice, indexed(later).byTrip, now);
    assert.equal(r2[0].how, 'schedule');
    assert.equal(r2[0].delaySec, 0);
});

test('canceled trips and skipped stops are excluded', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const canceled = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1', scheduleRelationship: TRIP.CANCELED } } }
    ]);
    assert.deepEqual(strings(nextDepartures(slice, indexed(canceled).byTrip, now)), ['134 Östbergahöjden 13 min']);

    const skipped = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 5, scheduleRelationship: STOP.SKIPPED }] } }
    ]);
    assert.deepEqual(strings(nextDepartures(slice, indexed(skipped).byTrip, now)), ['134 Östbergahöjden 13 min']);
});

test('NO_DATA update falls back to the schedule', async () => {
    const slice = await fixtureSlice();
    const now = at(2026, 9, 30, 9, 56, 30);
    const bytes = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 5, scheduleRelationship: STOP.NO_DATA }] } }
    ]);
    const r = nextDepartures(slice, indexed(bytes).byTrip, now);
    assert.equal(r[0].how, 'schedule');
    assert.equal(r[0].displayString, '134 Östbergahöjden 3 min');
});

test('indexTripUpdates keeps only requested trips but counts all', async () => {
    const now = at(2026, 9, 30, 9, 56, 30);
    const bytes = feedBytes(Math.floor(now / 1000), [
        { tripUpdate: { trip: { tripId: 't1' } } },
        { tripUpdate: { trip: { tripId: 'other' } } },
        { vehicle: { trip: { tripId: 't1' } } } // no tripUpdate: ignored
    ]);
    const { byTrip, total } = indexed(bytes, new Set(['t1']));
    assert.equal(total, 2);
    assert.deepEqual([...byTrip.keys()], ['t1']);
});

test('horizon: departures more than 3h away are not listed', async () => {
    const slice = await fixtureSlice();
    // 05:00 => t1 at 10:00 is 5h away
    assert.deepEqual(nextDepartures(slice, null, at(2026, 9, 30, 5, 0, 0)), []);
    assert.equal(nextDepartures(slice, null, at(2026, 9, 30, 5, 0, 0), { horizonMs: 6 * 3600 * 1000 }).length, 2);
});
