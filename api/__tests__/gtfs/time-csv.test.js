'use strict';
const assert = require('node:assert/strict');
const T = require('../../gtfs/time');
const { parseCsvLine, tableRows } = require('../../gtfs/csv');

test('parseGtfsTime handles hours past 24', () => {
    assert.equal(T.parseGtfsTime('10:00:00'), 36000);
    assert.equal(T.parseGtfsTime('25:10:00'), 90600);
    assert.equal(T.parseGtfsTime(''), null);
    assert.equal(T.parseGtfsTime('garbage'), null);
});

test('date helpers', () => {
    assert.equal(T.addDays('20260228', 1), '20260301');
    assert.equal(T.addDays('20261231', 1), '20270101');
    assert.equal(T.addDays('20260301', -1), '20260228');
    assert.equal(T.weekday('20260930'), 3); // Wednesday
    assert.equal(T.weekday('20261003'), 6); // Saturday
});

test('localDateString uses the Stockholm calendar day, not UTC', () => {
    // 22:30Z on Sep 30 is 00:30 on Oct 1 in Stockholm (CEST, UTC+2)
    assert.equal(T.localDateString(Date.UTC(2026, 8, 30, 22, 30)), '20261001');
    assert.equal(T.localDateString(Date.UTC(2026, 8, 30, 21, 30)), '20260930');
});

test('serviceDayBase on a normal summer day is local midnight', () => {
    assert.equal(T.serviceDayBase('20260930'), Date.UTC(2026, 8, 29, 22, 0, 0));
});

test('serviceDayBase is noon-minus-12h on DST changeover days', () => {
    // Clocks go back Sun 2026-10-25: noon is CET (UTC+1) = 11:00Z, minus 12h = 23:00Z the day before
    assert.equal(T.serviceDayBase('20261025'), Date.UTC(2026, 9, 24, 23, 0, 0));
    // Clocks go forward Sun 2026-03-29: noon is CEST (UTC+2) = 10:00Z, minus 12h = 22:00Z the day before
    assert.equal(T.serviceDayBase('20260329'), Date.UTC(2026, 2, 28, 22, 0, 0));
});

test('zonedToEpoch round-trips winter and summer offsets', () => {
    assert.equal(T.zonedToEpoch(2026, 1, 15, 12, 0, 0), Date.UTC(2026, 0, 15, 11, 0, 0));
    assert.equal(T.zonedToEpoch(2026, 7, 15, 12, 0, 0), Date.UTC(2026, 6, 15, 10, 0, 0));
});

test('CSV: quoted commas, doubled quotes, empty trailing field', () => {
    assert.deepEqual(parseCsvLine('a,"b,c","d ""x"" e",'), ['a', 'b,c', 'd "x" e', '']);
});

test('CSV: BOM and CRLF are handled', async () => {
    const lines = ['﻿id,name\r', '1,"A, B"\r', '\r', '2,C\r'];
    const rows = [];
    for await (const r of tableRows(lines)) rows.push(r);
    assert.deepEqual(rows, [{ id: '1', name: 'A, B' }, { id: '2', name: 'C' }]);
});

test('localDateString does not depend on the en-CA locale being available', () => {
    const Real = Intl.DateTimeFormat;
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((loc, opts) => new Real(loc === 'en-CA' ? 'en-US' : loc, opts));
    try {
        assert.equal(T.localDateString(Date.UTC(2026, 8, 30, 15, 39)), '20260930');
        assert.equal(T.localDateString(Date.UTC(2026, 8, 30, 22, 30)), '20261001'); // already Oct 1 in Stockholm
    } finally {
        spy.mockRestore();
    }
});
