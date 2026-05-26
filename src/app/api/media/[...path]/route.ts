import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import type { Readable } from 'stream';
import { getDiscoveredProgram, discoverPrograms } from '@/lib/manifest-reader';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  // Ensure discovery has run so getDiscoveredProgram works
  discoverPrograms();

  // First path segment is the program folder; use its discovered contentBase
  const programFolder = params.path[0];
  const discovered = getDiscoveredProgram(programFolder);
  const CONTENT_BASE = discovered?.contentBase
    ?? (process.env.CONTENT_BASE_PATH
      ? path.resolve(process.cwd(), process.env.CONTENT_BASE_PATH)
      : path.join(process.cwd(), '..', 'programs'));

  const RESOLVED_BASE = path.resolve(CONTENT_BASE);
  const filePath = path.join(CONTENT_BASE, ...params.path);
  const resolved = path.resolve(filePath);

  // Path traversal guard — resolved path must stay inside CONTENT_BASE
  if (!resolved.startsWith(RESOLVED_BASE + path.sep)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (path.extname(resolved) !== '.mp4') {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (!fs.existsSync(resolved)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const { size: fileSize } = fs.statSync(resolved);
  const range = request.headers.get('range');

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) return new NextResponse('Bad Request', { status: 400 });

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start > end || end >= fileSize) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    return new NextResponse(
      nodeToWeb(fs.createReadStream(resolved, { start, end })),
      {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': 'video/mp4',
        },
      },
    );
  }

  return new NextResponse(nodeToWeb(fs.createReadStream(resolved)), {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    },
  });
}

function nodeToWeb(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      (nodeStream as Readable).destroy();
    },
  });
}
