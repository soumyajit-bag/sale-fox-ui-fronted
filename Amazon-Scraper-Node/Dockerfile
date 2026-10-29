FROM node:20-slim

# curl is used by the turbo engine (same TLS fingerprint + cookie jar as the original Python build)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The official node image already ships a non-root user "node" with UID 1000
# (Hugging Face Spaces expects UID 1000).
USER node
ENV HOME=/home/node \
    NODE_ENV=production \
    PORT=7860

WORKDIR $HOME/app

# Install dependencies first for better layer caching
COPY --chown=node:node package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy application files
COPY --chown=node:node . .

# Ensure scraped_data directory exists and is writable
RUN mkdir -p scraped_data

# Hugging Face Spaces listens on port 7860
EXPOSE 7860

CMD ["node", "webServer.js"]
