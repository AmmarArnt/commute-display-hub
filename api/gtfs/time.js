'use strict';
// Time helpers with no dependencies. GTFS times are relative to "noon minus 12h"
// of the service day in the agency time zone, and may exceed 24:00:00.

const DEFAULT_TZ = 'Europe/Stockholm';

function parseGtfsTime(str) {
    if (str === undefined || str === null || str === '') return null;
    const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(str).trim());
    if (!m) return null;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

function tzOffsetMs(epochMs, tz) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const p = {};
    for (const part of dtf.formatToParts(new Date(epochMs))) p[part.type] = part.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUtc - Math.floor(epochMs / 1000) * 1000;
}

// Epoch ms of a wall-clock time in the given zone.
function zonedToEpoch(y, mo, d, h, mi, s, tz = DEFAULT_TZ) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const first = guess - tzOffsetMs(guess, tz);
    return guess - tzOffsetMs(first, tz);
}

// 'YYYYMMDD' for the local calendar date of an instant.
function localDateString(epochMs, tz = DEFAULT_TZ) {
    const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return dtf.format(new Date(epochMs)).replace(/-/g, '');
}

function addDays(dateStr, n) {
    const t = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(4, 6) - 1, +dateStr.slice(6, 8) + n);
    const d = new Date(t);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 0 = Sunday ... 6 = Saturday
function weekday(dateStr) {
    return new Date(Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(4, 6) - 1, +dateStr.slice(6, 8))).getUTCDay();
}

// Epoch ms that GTFS times of the given service day are counted from.
function serviceDayBase(dateStr, tz = DEFAULT_TZ) {
    const noon = zonedToEpoch(+dateStr.slice(0, 4), +dateStr.slice(4, 6), +dateStr.slice(6, 8), 12, 0, 0, tz);
    return noon - 12 * 3600 * 1000;
}

module.exports = {
    DEFAULT_TZ, parseGtfsTime, tzOffsetMs, zonedToEpoch,
    localDateString, addDays, weekday, serviceDayBase
};
