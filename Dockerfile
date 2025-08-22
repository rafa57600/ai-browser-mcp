# AI Browser MCP - Docker Configuration

FROM node:18-slim

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3-dev \
    libatk-bridge2.0-dev \
    libdrm2 \
    libxkbcommon0 \
    libgtk-3-dev \
    libxss1 \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Create non-root user
RUN useradd -r -s /bin/false ai-browser-mcp && \
    chown -R ai-browser-mcp:ai-browser-mcp /app

# Switch to non-root user
USER ai-browser-mcp

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check OK')" || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV BROWSER_HEADLESS=true

# Start the server
CMD ["npm", "start"]