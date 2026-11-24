FROM node:22-bookworm-slim

# Recording tools. Rebuild the image (docker compose build --pull) to pick up new yt-dlp/streamlink releases.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
 && pip3 install --break-system-packages --no-cache-dir -U "yt-dlp[default,curl-cffi]" "streamlink>=6.8" \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
