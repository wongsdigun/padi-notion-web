import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, s3 } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join('/');
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = object.Body as ReadableStream | undefined;
    if (!body) return NextResponse.json({ error: 'empty object' }, { status: 404 });

    return new NextResponse(body as unknown as BodyInit, {
      headers: {
        'Content-Type': object.ContentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        ...(object.ContentLength ? { 'Content-Length': String(object.ContentLength) } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
