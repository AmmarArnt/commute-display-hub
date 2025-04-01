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

## Configuration

The API server is configured using environment variables, typically defined in the `api/.env` file (copied from `api/.env.example`).

Key variables include:

*   `API_BASE_URL`: Base URL for the departures API.
*   `STATION_SITE_ID`: The Site ID for the station.
*   `FILTER_LINE_NUMBER`: The line number to filter departures by.
*   `FILTER_DESTINATION_NAME`: The destination name to filter departures by.
*   `FILTER_DEPARTURES_TO_SHOW`: How many departures to return in the final response.
*   `PORT` (Optional): The port the server listens on (defaults to 3000).

Refer to `api/.env.example` for the full list and default values.

## Raspberry Pi Display Setup (TODO)

Instructions for setting up and running the Raspberry Pi display module (`raspberry-pi-display/display.js`) will be added here once developed.

## Contributing

(Add contribution guidelines if desired)

## License

(Add license information, e.g., MIT) 