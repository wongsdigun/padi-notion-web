import { S3Client } from '@aws-sdk/client-s3';

// Neon Object Storage: S3-compatible, path-style only, branch-scoped endpoint.
export const BUCKET = process.env.NEON_STORAGE_BUCKET || 'uploads';

const globalForS3 = globalThis as unknown as { __s3?: S3Client };

export const s3 =
  globalForS3.__s3 ??
  new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

globalForS3.__s3 = s3;

export function fileUrl(key: string) {
  return `/api/files/${key}`;
}
