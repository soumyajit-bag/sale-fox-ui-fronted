'use strict';
// Vercel serverless entry: re-export the Express app (Vercel's @vercel/node runtime calls it per request).
module.exports = require('../webServer').app;
