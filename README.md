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