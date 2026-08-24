import { prisma } from '@/lib/db/client';
import { getAdminUser } from '@/lib/auth/admin';
import { collectPieceRows, toCsv, toXlsx } from '@/lib/admin/export';

/**
 * Operational export.
 *
 * A route rather than a server action, because the browser needs to receive a
 * file download. The role is re-checked here: a route handler is reachable
 * directly, so it cannot rely on the admin layout having rendered.
 *
 * This carries no claim code, no claim hash, no internal id and no owner
 * email. The factory export, which does carry plaintext codes, is a separate
 * CLI path that writes an encrypted archive and never touches HTTP.
 */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  const batchCode = url.searchParams.get('batch') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;

  const rows = await collectPieceRows(prisma, { batchCode, status });
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `binkis-pieces-${stamp}.${format}`;

  await prisma.auditLog.create({
    data: {
      actor: admin.handle,
      action: 'ADMIN_EXPORTED',
      entity: `pieces:${batchCode ?? 'all'}`,
      after: { format, rowCount: rows.length } as never,
    },
  });

  if (format === 'xlsx') {
    const buffer = await toXlsx(rows);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
