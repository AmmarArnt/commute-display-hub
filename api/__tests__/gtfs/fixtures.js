'use strict';
const { textLines, tableRows } = require('../../gtfs/csv');
const { buildSlice } = require('../../gtfs/static');
const { rt, decodeFeed, indexTripUpdates } = require('../../gtfs/realtime');

const ROUTES = `route_id,agency_id,route_short_name,route_long_name,route_type
r134,1,134,,700
r135,1,135,,700
`;

const TRIPS = `route_id,service_id,trip_id,trip_headsign,direction_id
r134,wk,t1,Östbergahöjden,1
r134,wk,t2,Östbergahöjden,1
r134,wk,t3,Gullmarsplan,0
r134,late,t4,Östbergahöjden,1
r135,wk,t5,Östbergahöjden,1
`;

// S_B is the stop we care about. t3 has the wrong headsign, t5 is another line.
const STOP_TIMES = `trip_id,arrival_time,departure_time,stop_id,stop_sequence
t1,09:58:00,09:58:00,S_A,3
t1,10:00:00,10:00:00,S_B,5
t1,10:05:00,10:05:00,S_X,6
t2,10:10:00,10:10:00,S_B,5
t3,10:03:00,10:03:00,S_B,7
t4,25:10:00,25:10:00,S_B,5
t5,10:04:00,10:04:00,S_B,5
`;

// wk: weekdays, removed on Thu 2026-10-01, added on Sat 2026-10-03. late: every day.
const CALENDAR = `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
wk,1,1,1,1,1,0,0,20260901,20261231
late,1,1,1,1,1,1,1,20260901,20261231
`;

const CALENDAR_DATES = `service_id,date,exception_type
wk,20261001,2
wk,20261003,1
`;

const STOPS = `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code
S_B,"Östbergahöjden, T-bana",59.3,18.0,0,S_P,B
S_A,"Östbergahöjden, T-bana",59.3,18.0,0,S_P,A
S_Z,Gullmarsplan,59.29,18.08,0,,
`;

async function fixtureSlice(opts = {}) {
    return buildSlice({
        routes: tableRows(textLines(ROUTES)),
        trips: tableRows(textLines(TRIPS)),
        stopTimes: tableRows(textLines(STOP_TIMES)),
        calendar: tableRows(textLines(CALENDAR)),
        calendarDates: tableRows(textLines(CALENDAR_DATES))
    }, { stopIds: ['S_B'], line: 134, headsign: 'Östbergahöjden', ...opts });
}

// Encodes real protobuf bytes and decodes them again, so tests exercise the same path as the live feed.
function feedBytes(timestampSec, entities) {
    const msg = rt.FeedMessage.create({
        header: { gtfsRealtimeVersion: '2.0', timestamp: timestampSec },
        entity: entities.map((e, i) => ({ id: String(i + 1), ...e }))
    });
    return Buffer.from(rt.FeedMessage.encode(msg).finish());
}

function indexed(bytes, tripIds) {
    return indexTripUpdates(decodeFeed(bytes), tripIds);
}

module.exports = { fixtureSlice, feedBytes, indexed, STOPS, rt, tableRows, textLines };
