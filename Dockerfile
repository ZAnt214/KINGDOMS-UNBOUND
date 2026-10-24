FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "src/server.js"]
