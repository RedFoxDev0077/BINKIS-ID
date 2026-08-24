'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/admin';
import { readRows, runImport, type ImportReport } from '@/lib/admin/import';

export interface ImportState {
  status: 'idle' | 'preview' | 'applied' | 'error';
  message?: string;
  report?: ImportReport;
}

/** Refuse anything large enough to be a mistake or an attack. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function runImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const admin = await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a .csv or .xlsx file.' };
  }
  if (file.size > MAX_BYTES) {
    return { status: 'error', message: 'That file is larger than 8 MB.' };
  }
  if (!/\.(csv|xlsx)$/i.test(file.name)) {
    return { status: 'error', message: 'Only .csv and .xlsx are accepted.' };
  }

  const apply = formData.get('mode') === 'apply';

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await readRows(buffer, file.name);

    if (rows.length === 0) {
      return { status: 'error', message: 'No rows found in that file.' };
    }

    const report = await runImport(prisma, rows, { apply, actor: admin.handle });

    if (apply) {
      revalidatePath('/admin/pieces');
      revalidatePath('/admin/audit');
      return { status: 'applied', report };
    }
    return { status: 'preview', report };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}
