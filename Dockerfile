# Build stage for frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build the Next.js app in standalone mode
RUN npm run build

# Runtime stage
FROM python:3.12-alpine

# Install system dependencies and upgrade all packages for security
RUN apk update && apk upgrade && apk add --no-cache \
    nodejs \
    npm \
    supervisor \
    curl \
    unzip \
    fuse3 \
    ca-certificates

# Install rclone
RUN curl -O https://downloads.rclone.org/rclone-current-linux-amd64.zip && \
    unzip rclone-current-linux-amd64.zip && \
    cp rclone-*-linux-amd64/rclone /usr/local/bin/ && \
    chmod +x /usr/local/bin/rclone && \
    rm -rf rclone-*-linux-amd64* rclone-current-linux-amd64.zip

# Create app user
RUN addgroup -g 1000 grabarr && \
    adduser -u 1000 -G grabarr -D grabarr

# Create directories
RUN mkdir -p /app/backend /app/frontend /config && \
    chown -R grabarr:grabarr /app /config

WORKDIR /app

# Copy backend requirements and install
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source
COPY backend/ /app/backend/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/frontend/.next/standalone /app/frontend/
COPY --from=frontend-builder /app/frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-builder /app/frontend/public /app/frontend/public

# Copy supervisord configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set ownership
RUN chown -R grabarr:grabarr /app

# Environment variables
ENV GRABARR_DB_PATH=/config/grabarr.db
ENV GRABARR_JWT_SECRET_PATH=/config/.jwt_secret
ENV GRABARR_KEY_PATH=/config/.grabarr_key
ENV GRABARR_RCLONE_AUTH_PATH=/config/.rclone_auth
ENV GRABARR_HOST=0.0.0.0
ENV GRABARR_BACKEND_PORT=8001
ENV PORT=3643
ENV NODE_ENV=production

# Expose the main port
EXPOSE 3643

# Volume for persistent data
VOLUME /config

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3643/api/auth/status || exit 1

# Run as grabarr user
USER grabarr

# Start supervisord
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
