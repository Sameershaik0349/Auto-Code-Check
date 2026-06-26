# --- Stage 1: Build the React client ---
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: Set up the Python ASGI Backend ---
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system dependencies for psycopg2/database
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Django backend
COPY backend/ ./backend

# Copy built frontend static files from Stage 1 to the correct staticfiles search location
COPY --from=client-builder /app/client/dist ./client/dist

# Set workdir to backend for django manage commands
WORKDIR /app/backend

# Expose port 8000
EXPOSE 8000

# Run migrations and collectstatic, then start Daphne ASGI server
CMD python manage.py migrate --noinput && python manage.py collectstatic --noinput && daphne -b 0.0.0.0 -p 8000 config.asgi:application
