import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, fileUrl, s3 } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${['B', 'KiB', 'MiB', 'GiB'][i]}`;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const taskId = String(form.get('taskId') || 'unassigned');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const safeName = file.name.replace(/[^\w.-]/g, '_');
    const key = `${taskId}/${Date.now()}-${safeName}`;
    const body = Buffer.from(await file.arrayBuffer());

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: file.type || 'application/octet-stream',
      }),
    );

    return NextResponse.json({
      id: crypto.randomUUID(),
      name: file.name,
      size: formatBytes(file.size),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      url: fileUrl(key),
    });
  } catch (error) {
    console.error('[storage] upload failed:', (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
