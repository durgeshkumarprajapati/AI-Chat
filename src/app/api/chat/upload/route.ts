import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storage';
import { env } from '@/config/env';
import { AppError, ValidationError } from '@/errors';
import { multimodalService } from '@/features/rag/multimodal/multimodal.service';
import { createHash } from 'crypto';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);

    if (!env.server?.CHAT_UPLOAD_ENABLED) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Chat file uploads are currently disabled.' } },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const conversationId = (formData.get('conversationId') as string | null) || undefined;

    if (!file) {
      throw new ValidationError('File parameter is required.');
    }

    // 1. Path traversal & filename security normalization
    const originalName = file.name || 'attachment';
    const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');

    if (safeName.includes('..') || safeName.includes('/') || safeName.includes('\\')) {
      throw new ValidationError('Invalid or malicious filename detected.');
    }

    // 2. File extension & type validation
    const ext = path.extname(safeName).toLowerCase().replace('.', '');
    const allowedTypes = (env.server?.CHAT_UPLOAD_ALLOWED_TYPES || 'pdf,png,jpg,jpeg,webp,txt,md').split(',');

    if (!allowedTypes.includes(ext)) {
      throw new ValidationError(`Unsupported file type ".${ext}". Allowed types: ${allowedTypes.join(', ')}`);
    }

    // 3. File size validation
    const maxBytes = env.server?.CHAT_UPLOAD_MAX_BYTES || 10485760;
    if (file.size > maxBytes) {
      throw new ValidationError(`File size exceeds maximum limit of ${Math.round(maxBytes / 1024 / 1024)}MB.`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentHash = createHash('md5').update(buffer).digest('hex');

    // 4. Secure StorageProvider Key
    const storageKey = `documents/${authUser.id}/attachments/${contentHash.slice(0, 16)}_${safeName}`;
    const storageProvider = getStorageProvider();
    await storageProvider.upload(storageKey, buffer, file.type || 'application/octet-stream');

    // 5. Create ChatAttachment DB Record
    const attachment = await prisma.chatAttachment.create({
      data: {
        userId: authUser.id,
        conversationId,
        filename: safeName,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        storageKey,
        isTemporary: true
      }
    });

    // 6. Multimodal Pipeline Integration for PDF / Images / Text
    let extractedText = '';
    if (ext === 'pdf') {
      try {
        const { workerPdfParser } = await import('../../../../../worker/src/parsers/pdf.parser');
        const parsed = await workerPdfParser.parse(buffer);
        const pageTextMap = new Map<number, string>();
        for (const p of parsed.pages) {
          pageTextMap.set(p.pageNumber, p.text);
        }
        await multimodalService.processDocumentVisuals(authUser.id, attachment.id, pageTextMap);
        extractedText = parsed.pages.map((p) => p.text).join('\n\n');
      } catch (pdfErr) {
        console.warn('[ChatUpload] PDF parse warning:', pdfErr);
      }
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      try {
        const { defaultOCRProvider } = await import('@/features/rag/multimodal/ocr.provider');
        const { defaultVisionProvider } = await import('@/features/rag/multimodal/vision.provider');
        const ocrRes = await defaultOCRProvider.extractText(buffer);
        const visRes = await defaultVisionProvider.analyzeVisualContent(buffer, 'IMAGE', safeName);
        extractedText = `[IMAGE ATTACHMENT: ${safeName}]\nVision Analysis: ${visRes.description}${ocrRes.text ? '\nOCR Text: ' + ocrRes.text : ''}`;
      } catch (imgErr) {
        console.warn('[ChatUpload] Image vision warning:', imgErr);
      }
    } else if (['txt', 'md'].includes(ext)) {
      extractedText = buffer.toString('utf-8');
    }

    return NextResponse.json({
      success: true,
      data: {
        attachment: {
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          storageKey: attachment.storageKey,
          isTemporary: attachment.isTemporary,
          extractedTextSnippet: extractedText.slice(0, 500)
        }
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    console.error('POST /api/chat/upload error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Chat attachment upload failed.' } },
      { status: 500 }
    );
  }
}
