# SL Departures API

This is a simple Node.js Express API to fetch the next 3 bus departures for a specific line and destination from a given station using the **new Trafiklab SL Transport API**.

## Setup

1.  **Ensure you have the files:**
    *   `server.js`
    *   `package.json`
    *   *(Optional)* `.env` (Only needed if you want to set a custom `PORT`)

2.  **Install dependencies:**
    ```bash
    yarn install
    # or: npm install
    ```

3.  **(Optional) Create a `.env` file for custom port:**
    If you want to run on a port other than 3000, create a `.env` file:
    ```
    PORT=your_desired_port_number
    ```

## Running the API

Start the server:

```bash
yarn start
# or: npm start
```

The server will start, typically on port 3000 (or the port specified in `.env`).

## Usage

Open your browser or use a tool like `curl` to access the endpoint:

```bash
curl http://localhost:3000/departures
```

**Example Response:**

```json
[
  "134 Östbergahöjden 3 min",
  "134 Östbergahöjden 15 min",
  "134 Östbergahöjden 28 min"
]
```

**Note:** If no relevant departures are found, an empty array `[]` will be returned.

## Configuration

You can modify the following constants in `server.js` if needed:

*   `ARSTABERG_SITE_ID`: The Site ID for the station (default: `9531` for Årstaberg bus platforms serving line 134).
*   `LINE_NUMBER`: The bus line number (default: `134`).
*   `DESTINATION_NAME`: The destination name to filter by (default: `Östbergahöjden`).
*   `DEPARTURES_TO_SHOW`: How many departures to return (default: `3`). 