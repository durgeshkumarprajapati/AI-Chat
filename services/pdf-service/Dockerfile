# Optional service — not part of the default build/deploy. Only built/run when an operator
# explicitly opts into PDF_EXTRACTION_PROVIDER=pymupdf.
FROM python:3.12-slim

RUN groupadd --system pdfservice && useradd --system --gid pdfservice pdfservice

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

USER pdfservice

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)" || exit 1

# uvicorn forwards SIGTERM to the ASGI app for graceful shutdown (in-flight requests complete,
# new connections stop being accepted) — no extra signal handling needed for this stateless service.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
