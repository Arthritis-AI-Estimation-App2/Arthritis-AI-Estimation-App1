FROM python:3.11-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080 \
    MPLCONFIGDIR=/tmp/matplotlib

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install --no-install-recommends -y libglib2.0-0t64 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-linux.txt .
RUN python -m pip install --upgrade setuptools==80.10.2 \
    && python -m pip install -r requirements-linux.txt

RUN useradd --create-home --uid 10001 appuser
COPY --chown=appuser:appuser api.py serve.py ./
COPY --chown=appuser:appuser model/ra_screening_model.json model/ra_screening_model.pt ./model/
USER appuser

CMD ["sh", "-c", "exec uvicorn api:app --host 0.0.0.0 --port ${PORT} --workers 1 --no-access-log"]
