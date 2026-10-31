# The release control plane's app. It holds no secrets: they come from the Secret
# release-secrets, and storage's token from the pod's projected volume.
FROM node:22-slim
ENV NODE_ENV=production PORT=8080
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && apt-get purge -y git && apt-get autoremove -y
COPY app/ app/
RUN rm -rf app/test
USER node
EXPOSE 8080
CMD ["node", "app/server.js"]
