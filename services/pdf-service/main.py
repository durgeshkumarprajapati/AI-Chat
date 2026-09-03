"""
Optional PDF extraction service (FastAPI + PyMuPDF).

Not part of the default local development or production pipeline — the Node.js worker's default
PDF_EXTRACTION_PROVIDER is "pdfjs" and never talks to this service unless an operator explicitly
sets PDF_EXTRACTION_PROVIDER=pymupdf and PDF_SERVICE_URL. See PDFExtractionProvider in
worker/src/parsers/ for the Node-side integration.

Design note: the PDF bytes are sent directly by the worker (multipart upload) rather than this
service resolving a storage key itself. The existing storage abstraction (src/lib/storage.ts,
src/lib/s3.ts) supports local disk and S3, and giving a second, separate language runtime its own
copy of storage credentials/config to duplicate that abstraction was judged more invasive than
having the worker (which already downloads the file for the default pdfjs path) simply forward
the bytes it already has in memory.
"""
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import List, Optional

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}'
)
logger = logging.getLogger("pdf-service")

# Never derived from a request body/header — configuration only, and never logged.
MAX_PDF_SIZE_BYTES = int(os.environ.get("PDF_SERVICE_MAX_FILE_SIZE_BYTES", str(25 * 1024 * 1024)))
MAX_PAGES = int(os.environ.get("PDF_SERVICE_MAX_PAGES", "2000"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f'{{"event": "pdf_service_started", "maxFileSizeBytes": {MAX_PDF_SIZE_BYTES}, "maxPages": {MAX_PAGES}}}')
    yield
    logger.info('{"event": "pdf_service_shutdown"}')


app = FastAPI(title="PDF Extraction Service", version="1.0.0", lifespan=lifespan)


class PageResult(BaseModel):
    pageNumber: int
    text: str


class ExtractionMetadata(BaseModel):
    extractionTimeMs: int
    ocrUsed: bool = False


class ExtractionResponse(BaseModel):
    documentId: str
    totalPages: int
    pages: List[PageResult]
    metadata: ExtractionMetadata


class ErrorResponse(BaseModel):
    error: str
    message: str


def clean_extracted_text(text: str) -> str:
    """Mirrors the normalization already applied by the Node pdfjs parser (cleanExtractedText in
    worker/src/parsers/pdf.parser.ts) closely enough that downstream chunking sees comparable
    input regardless of which extraction provider ran."""
    if not text:
        return ""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [" ".join(line.split()) for line in normalized.split("\n")]
    joined = "\n".join(line.strip() for line in lines)
    while "\n\n\n" in joined:
        joined = joined.replace("\n\n\n", "\n\n")
    return joined.strip()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    # No external dependencies (no DB, no network calls) — readiness is identical to liveness.
    return {"status": "ok"}


@app.post(
    "/v1/extract",
    response_model=ExtractionResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}}
)
async def extract(
    request: Request,
    documentId: str = Form(...),
    file: UploadFile = File(...),
    enableOcrFallback: Optional[bool] = Form(default=False)
):
    start_time = time.monotonic()

    if not documentId or not documentId.strip():
        raise HTTPException(status_code=400, detail={"error": "invalid_request", "message": "documentId is required."})

    if file.content_type not in ("application/pdf", "application/octet-stream", None):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_request", "message": f'Unsupported content type "{file.content_type}". Expected application/pdf.'}
        )

    # Memory-safe: read in bounded chunks and abort as soon as the size limit is exceeded,
    # rather than buffering an unbounded upload fully before checking.
    chunks = []
    total_size = 0
    chunk_size = 1024 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_PDF_SIZE_BYTES:
            logger.warning(f'{{"event": "extraction_rejected", "reason": "file_too_large", "documentId": "{documentId}"}}')
            raise HTTPException(
                status_code=413,
                detail={"error": "file_too_large", "message": f"File exceeds maximum size of {MAX_PDF_SIZE_BYTES} bytes."}
            )
        chunks.append(chunk)
    pdf_bytes = b"".join(chunks)

    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail={"error": "invalid_request", "message": "Uploaded file is empty."})

    logger.info(f'{{"event": "extraction_started", "documentId": "{documentId}", "sizeBytes": {len(pdf_bytes)}}}')

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises its own exception types for corrupted files
        logger.warning(f'{{"event": "extraction_failed", "reason": "corrupted_pdf", "documentId": "{documentId}"}}')
        raise HTTPException(
            status_code=422,
            detail={"error": "corrupted_pdf", "message": "Invalid or corrupted PDF format."}
        ) from exc

    try:
        page_count = doc.page_count
        if page_count == 0:
            raise HTTPException(status_code=422, detail={"error": "no_pages", "message": "PDF document has zero pages."})
        if page_count > MAX_PAGES:
            raise HTTPException(
                status_code=413,
                detail={"error": "too_many_pages", "message": f"Document has {page_count} pages, exceeding the limit of {MAX_PAGES}."}
            )

        pages: List[PageResult] = []
        total_extracted_length = 0
        for page_index in range(page_count):
            page = doc.load_page(page_index)
            raw_text = page.get_text("text")
            cleaned = clean_extracted_text(raw_text)
            total_extracted_length += len(cleaned)
            pages.append(PageResult(pageNumber=page_index + 1, text=cleaned))

        if total_extracted_length == 0:
            # Matches the existing Node pdfjs parser's behavior exactly (pdf.parser.ts throws the
            # same condition as a hard failure) — OCR-fallback text recovery does not exist in the
            # current ingestion pipeline for either provider; enableOcrFallback is accepted for
            # forward compatibility but is a documented no-op today (see final report).
            logger.warning(f'{{"event": "extraction_failed", "reason": "no_extractable_text", "documentId": "{documentId}"}}')
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "no_extractable_text",
                    "message": "No extractable text found in PDF document. Image-only or scanned PDFs require OCR processing."
                }
            )

        extraction_time_ms = int((time.monotonic() - start_time) * 1000)
        logger.info(
            f'{{"event": "extraction_completed", "documentId": "{documentId}", "totalPages": {page_count}, "extractionTimeMs": {extraction_time_ms}}}'
        )

        return ExtractionResponse(
            documentId=documentId,
            totalPages=page_count,
            pages=pages,
            metadata=ExtractionMetadata(extractionTimeMs=extraction_time_ms, ocrUsed=False)
        )
    finally:
        doc.close()


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"error": "error", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=detail)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak internal exception details/stack traces to the client; log server-side only.
    logger.error(f'{{"event": "unhandled_exception", "path": "{request.url.path}", "type": "{type(exc).__name__}"}}')
    return JSONResponse(status_code=500, content={"error": "internal_error", "message": "PDF extraction failed unexpectedly."})
