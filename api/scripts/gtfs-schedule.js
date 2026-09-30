#!/usr/bin/env node
'use strict';
// Builds api/data/schedule.json: the timetable for one line at your stop(s), taken from the
// Trafiklab "GTFS Regional Static data" zip. Needs the `unzip` command (Raspberry Pi OS: sudo apt install unzip).
//
//   yarn gtfs:stops --name "Årstaberg"                       # find stop ids (platforms)
//   yarn gtfs:update --stop-ids 9022001013235002 --line 134  # download + build
//   yarn gtfs:update --zip ./sl.zip --stop-ids ... --line 134 # build from an already downloaded zip
//
// Keys come from the environment (GTFS_STATIC_API_KEY, or api/.env) and are never printed.
// Bronze keys allow only 50 static downloads a month; run this daily at most.

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn, execFileSync } = require('child_process');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { tableRows } = require('../gtfs/csv');
const { findStops, buildSlice } = require('../gtfs/static');

const DEFAULT_ZIP_URL = 'https://opendata.samtrafiken.se/gtfs/sl/sl.zip';
const DEFAULT_OUT = path.resolve(__dirname, '..', 'data', 'schedule.json');

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith('--')) continue;
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) out[argv[i].slice(2)] = true;
        else { out[argv[i].slice(2)] = next; i++; }
    }
    return out;
}

function zipEntries(zip) {
    try {
        return new Set(execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean));
    } catch (e) {
        if (e.code === 'ENOENT') throw new Error('The `unzip` command is required (Raspberry Pi OS: sudo apt install unzip).');
        throw new Error(`Could not read ${zip}: ${e.message}`);
    }
}

// Lazy on purpose: readline drops lines that arrive before iteration starts, so `unzip` must
// only be spawned when the table is actually consumed.
function makeTable(zip, entries) {
    return (name, optional) => {
        if (!entries.has(name)) {
            if (optional) return [];
            throw new Error(`${name} is missing from the zip.`);
        }
        return (async function* () {
            const child = spawn('unzip', ['-p', zip, name], { stdio: ['ignore', 'pipe', 'inherit'] });
            child.on('error', (e) => { console.error('unzip failed:', e.message); process.exit(1); });
            yield* tableRows(readline.createInterface({ input: child.stdout, crlfDelay: Infinity }));
        })();
    };
}

async function download(dest) {
    const key = process.env.GTFS_STATIC_API_KEY;
    if (!key) throw new Error('Set GTFS_STATIC_API_KEY (Trafiklab "GTFS Regional Static data" key), or pass --zip <file>.');
    const url = process.env.GTFS_STATIC_URL || DEFAULT_ZIP_URL;
    console.log('Downloading the SL timetable (~50 MB)...');
    const res = await axios.get(url, {
        params: { key },
        responseType: 'stream',
        headers: { 'Accept-Encoding': 'gzip, deflate' },
        timeout: 120000,
        validateStatus: () => true
    });
    if (res.status !== 200) {
        let body = '';
        for await (const chunk of res.data) { body += chunk; if (body.length > 300) break; }
        throw new Error(`Download failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    await require('stream/promises').pipeline(res.data, fs.createWriteStream(dest));
    const fd = fs.openSync(dest, 'r');
    const magic = Buffer.alloc(2);
    fs.readSync(fd, magic, 0, 2, 0);
    fs.closeSync(fd);
    if (magic.toString('latin1') !== 'PK') throw new Error('Downloaded file is not a zip.');
}

let finished = false;
process.on('exit', (code) => {
    if (!finished && code === 0) { console.error('Ended before completing. Nothing was written.'); process.exitCode = 3; }
});

(async () => {
    const [cmd, ...rest] = process.argv.slice(2);
    const args = parseArgs(rest);
    if (cmd !== 'stops' && cmd !== 'update') {
        console.error('Usage:\n  gtfs-schedule.js stops --name <text> [--zip file]\n  gtfs-schedule.js update --stop-ids <id,id> --line <n> [--zip file] [--out file]');
        process.exit(2);
    }

    let zip = args.zip;
    let tmpDir = null;
    if (!zip) {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfs-'));
        zip = path.join(tmpDir, 'sl.zip');
        await download(zip);
    }
    try {
        const table = makeTable(zip, zipEntries(zip));

        if (cmd === 'stops') {
            if (typeof args.name !== 'string') { console.error('--name is required'); process.exit(2); }
            const found = await findStops(table('stops.txt'), { name: args.name });
            if (!found.length) console.log('No matching stops.');
            for (const s of found) console.log(`${s.stop_id}\t${s.stop_name}\tplatform=${s.platform_code || '-'}\ttype=${s.location_type || '0'}`);
            finished = true;
            return;
        }

        const line = args.line;
        const stopIds = typeof args['stop-ids'] === 'string' ? args['stop-ids'].split(',').map((s) => s.trim()).filter(Boolean) : [];
        if (!line || line === true || !stopIds.length) { console.error('--line and --stop-ids are required'); process.exit(2); }

        // No headsign filter: SL leaves trip_headsign empty, and a stop point is served in one direction.
        const slice = await buildSlice({
            routes: table('routes.txt'),
            trips: table('trips.txt'),
            stopTimes: table('stop_times.txt'),
            stops: table('stops.txt'),
            calendar: table('calendar.txt', true),
            calendarDates: table('calendar_dates.txt', true)
        }, { stopIds, line: String(line), headsign: '' });

        const n = Object.keys(slice.trips).length;
        if (!n) { console.error(`No trips for line ${line} at ${stopIds.join(', ')}. Check the ids with "stops".`); process.exit(1); }
        const dest = new Map();
        for (const t of Object.values(slice.trips)) dest.set(t.headsign || '?', (dest.get(t.headsign || '?') || 0) + 1);
        console.log(`Line ${line}: ${n} trips, ${Object.keys(slice.services).length} service patterns. Timetable destinations: ${[...dest].map(([k, v]) => `${k} (${v})`).join(', ')}`);

        const out = args.out || DEFAULT_OUT;
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const tmp = `${out}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(slice));
        fs.renameSync(tmp, out); // atomic: the running API never sees a half-written file
        console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB). Restart the API to load it.`);
        finished = true;
    } finally {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
