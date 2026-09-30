const assert = require('node:assert/strict');
const { RealtimePoller } = require('../../gtfs/poller');
const { feedBytes } = require('./fixtures');

const silent = { log: () => {}, error: () => {} };
const good = (ts = 1000) => feedBytes(ts, [
    { tripUpdate: { trip: { tripId: 't1' }, stopTimeUpdate: [{ stopSequence: 5, departure: { delay: 60 } }] } },
    { tripUpdate: { trip: { tripId: 'other' }, stopTimeUpdate: [{ stopSequence: 1, departure: { delay: 5 } }] } }
]);

function make(script, extra = {}) {
    let now = 1_000_000;
    const calls = [];
    const p = new RealtimePoller({
        apiKey: 'SECRET-KEY',
        tripIds: new Set(['t1']),
        intervalMs: 60000,
        maxStaleMs: 600000,
        now: () => now,
        log: silent,
        fetchBuffer: async (url, key) => {
            calls.push({ url, key });
            const step = script.shift();
            if (step instanceof Error) throw step;
            return step;
        },
        ...extra
    });
    return { p, calls, advance: (ms) => { now += ms; }, calls };
}

test('a good poll keeps only our trips and exposes the data', async () => {
    const { p } = make([{ status: 200, buffer: good() }]);
    await p.pollOnce();
    const s = p.snapshot();
    assert.deepEqual([...s.byTrip.keys()], ['t1']);
    assert.equal(s.consecutiveFailures, 0);
    assert.equal(s.stale, false);
});

test('stale-while-error: last good data is served through failures, then dropped after maxStaleMs', async () => {
    const { p, advance } = make([{ status: 200, buffer: good() }, { status: 429, buffer: Buffer.from('') }, new Error('boom')]);
    await p.pollOnce();
    advance(60000);
    await p.pollOnce(); // HTTP 429
    assert.equal(p.snapshot().consecutiveFailures, 1);
    assert.ok(p.snapshot().byTrip, 'still serving the last good data');
    assert.equal(p.snapshot().lastError.status, 429);
    advance(60000);
    await p.pollOnce(); // network error
    assert.equal(p.snapshot().consecutiveFailures, 2);
    assert.ok(p.snapshot().byTrip);
    advance(600000);
    const s = p.snapshot();
    assert.equal(s.byTrip, null);
    assert.equal(s.stale, true);
});

test('garbage bytes count as a failure and do not replace good data', async () => {
    const { p } = make([{ status: 200, buffer: good() }, { status: 200, buffer: Buffer.from('<html>not protobuf</html>') }]);
    await p.pollOnce();
    await p.pollOnce();
    assert.equal(p.snapshot().consecutiveFailures, 1);
    assert.ok(p.snapshot().byTrip);
});

test('recovery resets the failure counter', async () => {
    const { p } = make([{ status: 500, buffer: Buffer.from('') }, { status: 200, buffer: good() }]);
    await p.pollOnce();
    assert.equal(p.snapshot().consecutiveFailures, 1);
    await p.pollOnce();
    assert.equal(p.snapshot().consecutiveFailures, 0);
    assert.equal(p.snapshot().lastError, null);
});

test('backoff doubles per failure and is capped', () => {
    const { p } = make([]);
    const at = (n) => { p.consecutiveFailures = n; return p._delay(); };
    assert.equal(at(0), 60000);
    assert.equal(at(1), 120000);
    assert.equal(at(2), 240000);
    assert.equal(at(3), 300000);
    assert.equal(at(10), 300000);
});

test('concurrent pollOnce calls share one request', async () => {
    const { p, calls } = make([{ status: 200, buffer: good() }, { status: 200, buffer: good() }]);
    await Promise.all([p.pollOnce(), p.pollOnce(), p.pollOnce()]);
    assert.equal(calls.length, 1);
});

test('the API key is sent as a parameter to the fetcher and never appears in error state or logs', async () => {
    const logged = [];
    const { p } = make([Object.assign(new Error('Request failed with status code 403'), { status: 403 })], {
        log: { log: (m) => logged.push(m), error: (m) => logged.push(m) }
    });
    await p.pollOnce();
    assert.ok(!JSON.stringify(p.snapshot()).includes('SECRET-KEY'));
    assert.ok(!logged.join('\n').includes('SECRET-KEY'));
});

test('idle: no polling once nobody has asked for departures for idleMs; touch() wakes it', async () => {
    jest.useFakeTimers();
    try {
        let now = 0;
        const calls = [];
        const p = new RealtimePoller({
            apiKey: 'k', tripIds: new Set(['t1']), intervalMs: 60000, idleMs: 300000, log: silent,
            now: () => now,
            fetchBuffer: async () => { calls.push(now); return { status: 200, buffer: good() }; }
        });
        p.start();
        for (let i = 0; i < 12; i++) { // 12 minutes with no requests
            now += 60000;
            await jest.advanceTimersByTimeAsync(60000);
        }
        const whileIdle = calls.length;
        assert.ok(whileIdle <= 6, `polled ${whileIdle} times; should stop after the idle window`);
        p.touch();
        await jest.advanceTimersByTimeAsync(1);
        assert.equal(calls.length, whileIdle + 1, 'touch() triggers an immediate poll');
        p.stop();
    } finally {
        jest.useRealTimers();
    }
});
