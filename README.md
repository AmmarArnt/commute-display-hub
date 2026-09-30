# Commute Display Hub

This project fetches real-time public transport data (initially from Stockholm's SL API) and presents it through various interfaces. The primary goal is to display upcoming departures on a Raspberry Pi powered LED matrix, but it also includes a simple Node.js/Express API backend and is designed to potentially support a web interface in the future.

## Modules

*   **API Server (`api/server.js`):** A Node.js Express server that fetches departure data from the relevant transport authority API (currently SL Transport API) and provides a simple endpoint (`/departures`).
*   **Raspberry Pi Display (`raspberry-pi-display/display.js`):** Code intended to run on a Raspberry Pi to consume the API data and display it on an LED matrix.
*   **Web Interface (Future):** Potential future module for displaying the data in a web browser.

## API Server Setup

1.  **Ensure you have the files:**
    *   `api/server.js`
    *   `api/.env.example`
    *   `package.json`

2.  **Create Environment File:**
    Copy `api/.env.example` to `api/.env`.
    ```bash
    cp api/.env.example api/.env
    ```
    Review the variables in `api/.env` and adjust if necessary (e.g., `STATION_SITE_ID`, `FILTER_LINE_NUMBER`, etc.). The default values match the previous hardcoded configuration.

3.  **Install dependencies:**
    Navigate to the project root directory in your terminal.
    ```bash
    yarn install
    # or: npm install
    ```

## Running the API Server

Start the server from the project root:

```bash
yarn start
# or: npm start
```

The server will load its configuration from `api/.env` and start, typically on port 3000 (unless `PORT` is set in `api/.env`).

## Using the API Endpoint

While the server is running, open your browser or use a tool like `curl` to access the endpoint:

```bash
curl http://localhost:3000/departures
```

**Example Response (for default SL config in `api/.env`):**

```json
[
  "134 Östbergahöjden 3 min",
  "134 Östbergahöjden 15 min",
  "134 Östbergahöjden 28 min"
]
```

**Note:** If no relevant departures are found, an empty array `[]` will be returned.

## Using GTFS Regional realtime instead of the SL Transport API

The SL Transport API (`transport.integration.sl.se`) is keyless and has started answering `429 Quota has been exceeded` for everyone. As an alternative the API can use Trafiklab's **GTFS Regional** data (`DATA_SOURCE=gtfs`). The `/departures` response is unchanged, so the Raspberry Pi display needs no changes.

How it works:

*   A **timetable** for one line at your stop is built once from the static GTFS zip into `api/data/schedule.json`.
*   The **realtime TripUpdates feed** is fetched in the background at most once per `GTFS_POLL_INTERVAL_MS` (default 60 s), independent of how many clients call `/departures`. It only polls while something has requested departures in the last `GTFS_IDLE_MS` (default 5 min), so a sleeping display costs no requests.
*   If the feed fails (429, network, bad data) the last good data keeps being used for up to `GTFS_MAX_STALE_MS` (default 10 min), with exponential backoff up to 5 min between attempts. After that the timetable alone is shown.
*   Only departures **from your stop** are listed. The destination text is `FILTER_DESTINATION_NAME` (SL shows "Östbergahöjden" on the bus, while the timetable's final stop is "Julitavägen").
*   Live data exists only for buses that are already underway; later ones use the timetable.

Setup:

1.  At [developer.trafiklab.se](https://developer.trafiklab.se) create a project with **GTFS Regional Static data** and **GTFS Regional Realtime** (each has its own key).
2.  Find your stop id (platform), e.g. for Årstaberg:
    ```bash
    yarn gtfs:stops --name "Årstaberg" --zip ./sl.zip     # or set GTFS_STATIC_API_KEY to download
    ```
    Årstaberg platform B (towards Östberga) is `9022001013235002`.
3.  Build the timetable (downloads ~50 MB; needs `unzip`, `sudo apt install unzip` on Raspberry Pi OS):
    ```bash
    GTFS_STATIC_API_KEY=... yarn gtfs:update --stop-ids 9022001013235002 --line 134
    ```
    Bronze keys allow 50 static downloads a month. The timetable changes a few times a year; rebuild it e.g. weekly or when `/health` reports it as expired, then restart the API.
4.  In `api/.env` set `DATA_SOURCE=gtfs` and `GTFS_RT_API_KEY` (see `api/.env.example`), then `yarn start`.

`GET /health` shows the data source, feed age, consecutive failures, last error, and until when the timetable is valid. `/departures` carries an `X-Data-Source` header (`gtfs-realtime` when at least one listed departure has live data, otherwise `gtfs-schedule`). API keys are never logged.

## Operating on the Raspberry Pi

The Pi runs two systemd services: `api.service` (this API) and `display.service` (the LED display, which polls the API). Commands below are run in the repo root (`~/commute-display-hub`).

### Deploying an update

```bash
cp -p api/.env api/.env.bak-$(date +%F-%H%M)   # back up the env file first
git pull
npm install --no-package-lock                   # only needed when dependencies changed (the Pi has npm, not yarn)
sudo systemctl restart api.service              # the display needs no restart, it just polls the API
```

Note that `ls` hides `api/.env`; use `ls -la api/`. Roll back the env file with `cp -p "$(ls -t api/.env.bak-* | head -1)" api/.env`, then restart `api.service`. Setting `DATA_SOURCE=sl` in `api/.env` switches back to the SL Transport API.

### Checking that it works

```bash
systemctl is-active api.service
curl -si localhost:3000/departures | grep -iE "HTTP/|x-data-source|^\["
curl -s localhost:3000/health          # realtime.usable/consecutiveFailures, schedule.validUntil/expired
journalctl -u api.service -n 50 --no-pager
```

`X-Data-Source: gtfs-schedule` only means that none of the listed buses has live data right now; it is not an error.

### Weekly timetable refresh (cron)

The GTFS timetable (`api/data/schedule.json`) is rebuilt weekly by a cron job on the Pi, Sundays 08:00 (SL publishes new data between 03:00 and 07:00). The static-data key is stored in `api/.env` as `GTFS_STATIC_API_KEY` (`chmod 600 api/.env`). The job script `~/bin/update-timetable.sh` is not part of the repo:

```bash
#!/bin/bash
# Weekly: rebuild the SL timetable, then restart the API only if that succeeded.
set -euo pipefail
export PATH="/path/to/node/bin:$PATH"     # cron has a minimal PATH; use `dirname "$(command -v npm)"`
cd /home/admin/commute-display-hub
echo "=== $(date '+%F %T') update start ==="
npm run gtfs:update -- --stop-ids 9022001013235002 --line 134
sudo -n systemctl restart api.service
sleep 8
curl -s localhost:3000/health
echo
echo "=== $(date '+%F %T') done ==="
```

Install and manage it:

```bash
chmod +x ~/bin/update-timetable.sh
mkdir -p ~/logs
( crontab -l 2>/dev/null | grep -v update-timetable.sh; echo '0 8 * * 0 /home/admin/bin/update-timetable.sh >> /home/admin/logs/timetable.log 2>&1' ) | crontab -
crontab -l                                  # show the schedule
~/bin/update-timetable.sh 2>&1 | tee -a ~/logs/timetable.log   # run it now (uses one of 50 monthly downloads)
tail -20 ~/logs/timetable.log               # result of the last run
```

If the download or build fails the script stops before the restart, and the previous timetable stays in place (the file is replaced atomically). Trafiklab bronze keys allow 50 static downloads per month. If the job ever stops running, `/health` reports `"expired":true` once the timetable runs out (currently valid until December 2026).

## Configuration

The API server is configured using environment variables, typically defined in the `api/.env` file (copied from `api/.env.example`).

Key variables include:

*   `API_BASE_URL`: Base URL for the departures API.
*   `STATION_SITE_ID`: The Site ID for the station.
*   `FILTER_LINE_NUMBER`: The line number to filter departures by.
*   `FILTER_DESTINATION_NAME`: The destination name to filter departures by.
*   `FILTER_DEPARTURES_TO_SHOW`: How many departures to return in the final response.
*   `DATA_SOURCE` (Optional): `sl` (default, SL Transport API) or `gtfs` (see above; then `API_BASE_URL`, `STATION_SITE_ID` and `FILTER_MAX_DEPARTURES_TO_FETCH` are not needed).
*   `PORT` (Optional): The port the server listens on (defaults to 3000).

Refer to `api/.env.example` for the full list and default values.

## Raspberry Pi Display Setup (TODO)

Instructions for setting up and running the Raspberry Pi display module (`raspberry-pi-display/display.js`) will be added here once developed.

## Contributing

(Add contribution guidelines if desired)

## License

(Add license information, e.g., MIT) 