'use strict';
// Minimal GTFS CSV reader. Handles quoted fields with commas and doubled quotes.
// Does not support quoted fields that span multiple lines (not used in SL's feed).

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
            } else {
                cur += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            out.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    out.push(cur);
    return out;
}

// Turns an (async) iterable of text lines into an async iterable of row objects.
async function* tableRows(lines) {
    let header = null;
    for await (const raw of lines) {
        let line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
        if (header === null) line = line.replace(/^﻿/, '');
        if (!line.length) continue;
        const values = parseCsvLine(line);
        if (header === null) { header = values; continue; }
        const row = {};
        for (let i = 0; i < header.length; i++) row[header[i]] = values[i] === undefined ? '' : values[i];
        yield row;
    }
}

// Convenience for small in-memory text (tests).
async function* textLines(text) {
    for (const l of text.split('\n')) yield l;
}

module.exports = { parseCsvLine, tableRows, textLines };
