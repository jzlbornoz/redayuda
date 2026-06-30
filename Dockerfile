FROM python:3.12-slim

# Evita .pyc y buffering en logs de contenedor
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencias de runtime (mismas versiones que pyproject.toml).
# Se instalan aparte del codigo para aprovechar la cache de capas.
RUN pip install --no-cache-dir \
    "fastapi[standard]==0.138.1" \
    "httpx>=0.28,<1.0" \
    "python-dotenv>=1.0,<2.0"

# Codigo de la app y frontend estatico.
COPY app ./app
COPY static ./static

# El indice SQLite vive en el volumen persistente de Render montado en /data.
ENV DATABASE_PATH=/data/index.db
RUN mkdir -p /data

# Usuario no-root; debe poder escribir el volumen /data.
RUN useradd --system --uid 10001 appuser \
    && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys,os; port=os.environ.get('PORT','8000'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{port}/health').status==200 else 1)"

# Render inyecta PORT (normalmente 10000). En local usa 8000 por defecto.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
