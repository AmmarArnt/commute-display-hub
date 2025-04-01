// api/start.js

// This file is the actual entry point for running the server.
// It imports the configured app from server.js and starts listening.

const app = require('./server');
const config = require('./config').loadAndValidateConfig(); // Load config again for port

app.listen(config.port, () => {
    console.log(`Commute Display Hub API server listening on port ${config.port}`);
    console.log(`Access the endpoint at http://localhost:${config.port}/departures`);
}); 