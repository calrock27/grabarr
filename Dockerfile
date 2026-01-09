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

# Add Alpine Edge main repo for latest curl (CVE-2025-14819, CVE-2025-14017, CVE-2025-14524 fix)
RUN echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories

# Install system dependencies and upgrade all packages for security
RUN apk update && apk upgrade && apk add --no-cache \
    nodejs \
    npm \
    supervisor \
    curl@edge \
    unzip \
    fuse3 \
    ca-certificates \
    su-exec

# Upgrade pip to fix CVE-2025-8869 (path traversal vulnerability)
RUN pip install --no-cache-dir --upgrade "pip>=25.2"

# Install rclone then remove unzip binary (CVE-2008-0888 mitigation - not needed at runtime)
RUN curl -O https://downloads.rclone.org/rclone-current-linux-amd64.zip && \
    unzip rclone-current-linux-amd64.zip && \
    cp rclone-*-linux-amd64/rclone /usr/local/bin/ && \
    chmod +x /usr/local/bin/rclone && \
    rm -rf rclone-*-linux-amd64* rclone-current-linux-amd64.zip && \
    rm -f /usr/bin/unzip /usr/bin/funzip /usr/bin/unzipsfx /usr/bin/zipinfo

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

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

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

# Entrypoint handles permissions and drops to grabarr user
ENTRYPOINT ["/entrypoint.sh"]
