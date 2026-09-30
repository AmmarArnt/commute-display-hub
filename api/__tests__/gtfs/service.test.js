const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GtfsService, loadSchedule, scheduleValidUntil } = require('../../gtfs/service');
const { zonedToEpoch } = require('../../gtfs/time');
const { fixtureSlice, feedBytes, indexed } = require('./fixtures');

let dir;
let file;
beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfs-svc-'));
    file = path.join(dir, 'schedule.json');
    fs.writeFileSync(file, JSON.stringify(await fixtureSlice()));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const NOW = zonedToEpoch(2026, 9, 30, 9, 56, 30);

function fakePoller(byTrip, extra = {}) {
    return { touched: 0, touch() { this.touched++; }, snapshot: () => ({ byTrip, ageMs: 1000, stale: false, feedAgeMs: 5000, consecutiveFailures: 0, lastError: null, ...extra }), stop() {} };
}

test('shows the configured label, not the timetable destination, in the SL output format', () => {
    const svc = new GtfsService({ schedulePath: file, label: 'Östbergahöjden', departuresToShow: 3, poller: fakePoller(null), now: () => NOW });
    const { departures, source } = svc.getDepartures();
    assert.deepEqual(departures, ['134 Östbergahöjden 3 min', '134 Östbergahöjden 13 min']);
    assert.equal(source, 'gtfs-schedule');
    const svc2 = new GtfsService({ schedulePath: file, label: 'Somewhere Else', departuresToShow: 1, poller: fakePoller(null), now: () => NOW });
    assert.deepEqual(svc2.getDepartures().departures, ['134 Somewhere Else 3 min']);
});

test('honours departuresToShow and touches the poller on every call', () => {
    const poller = fakePoller(null);
    const svc = new GtfsService({ schedulePath: file, label: 'X', departuresToShow: 1, poller, now: () => NOW });
    assert.equal(svc.getDepartures().departures.length, 1);
    svc.getDepartures();
    assert.equal(poller.touched, 2);
});

test('live data changes the minutes and the reported source', async () => {
    const slice = await fixtureSlice();
    const bytes = feedBytes(Math.floor(NOW / 1000), [
        { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 5, departure: { delay: 300 } }] } }
    ]);
    const { byTrip } = indexed(bytes, new Set(Object.keys(slice.trips)));
    const svc = new GtfsService({ schedulePath: file, label: 'X', departuresToShow: 2, poller: fakePoller(byTrip), now: () => NOW });
    const r = svc.getDepartures();
    assert.equal(r.departures[0], '134 X 8 min'); // 10:05:00 - 09:56:30
    assert.equal(r.source, 'gtfs-realtime');
});

test('health reports realtime state and schedule validity, without secrets', () => {
    const svc = new GtfsService({ schedulePath: file, label: 'X', departuresToShow: 3, poller: fakePoller(null, { stale: true, consecutiveFailures: 4, lastError: { message: 'HTTP 429', status: 429, at: 1 } }), now: () => NOW });
    const h = svc.health();
    assert.equal(h.realtime.usable, false);
    assert.equal(h.realtime.stale, true);
    assert.equal(h.realtime.lastError.status, 429);
    assert.equal(h.schedule.validUntil, '20261231');
    assert.equal(h.schedule.expired, false);
    assert.equal(svc.health().schedule.line, '134');
});

test('an expired schedule is flagged', () => {
    const later = zonedToEpoch(2027, 2, 1, 12, 0, 0);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = new GtfsService({ schedulePath: file, label: 'X', departuresToShow: 3, poller: fakePoller(null), now: () => later });
    assert.equal(svc.health().schedule.expired, true);
    assert.ok(warn.mock.calls.length >= 1);
    warn.mockRestore();
});

test('loadSchedule gives helpful errors for a missing or malformed file', () => {
    assert.throws(() => loadSchedule(path.join(dir, 'nope.json')), /yarn gtfs:update/);
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{"hello":1}');
    assert.throws(() => loadSchedule(bad), /unexpected format/);
});

test('scheduleValidUntil takes the latest calendar end or added date', async () => {
    assert.equal(scheduleValidUntil(await fixtureSlice()), '20261231');
});
