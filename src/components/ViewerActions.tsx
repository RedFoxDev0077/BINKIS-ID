'use client';

import { useEffect, useState } from 'react';
import { ClaimForm } from './ClaimForm';
import { TransferPanel } from './TransferPanel';
import { Card } from './ui/Card';
import type { Dictionary } from '@/lib/i18n';

/**
 * The part of a passport that depends on who is looking.
 *
 * Everything else on the page is identical for every visitor, which is what
 * lets the page be cached and stop querying the database on every scan. These
 * three facts are not, so they are fetched here, after the page has already
 * rendered and been read.
 *
 * That ordering is deliberate. A collector standing in a shop sees the piece,
 * its serial and its history immediately, from cache. The claim box arrives a
 * moment later, which is the right way round: the slow part is the part they
 * have to walk to a scratch panel for anyway.
 */

interface Viewer {
  signedIn: boolean;
  isOwner: boolean;
  pendingTransfer: boolean;
}

export function ViewerActions({
  qrToken,
  serial,
  claimable,
  t,
}: {
  qrToken: string;
  serial: string;
  /** Public: the piece is UNCLAIMED. Everyone sees the same value. */
  claimable: boolean;
  t: Dictionary;
}) {
  const [viewer, setViewer] = useState<Viewer | null>(null);

  /**
   * Whether this visitor arrived at an unclaimed piece, captured once.
   *
   * useState ignores its argument after the first render, which is the whole
   * point here. When a claim succeeds the action invalidates the piece, the
   * router refreshes this route, and `claimable` arrives as false. If we read
   * the prop directly we would unmount ClaimForm at that exact moment and
   * take the success reveal with it - the claim works and the collector
   * watches the form vanish.
   *
   * That has now happened twice, first through revalidatePath and then
   * through revalidateTag. Tag invalidation refreshes the current route just
   * as path invalidation does, so the fix cannot be to pick a gentler
   * invalidation. It has to be that this component stops caring.
   */
  const [arrivedUnclaimed] = useState(claimable);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/viewer/${qrToken}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Viewer | null) => {
        if (cancelled) return;
        // A failed lookup is not an error state for the visitor. Treat it as
        // signed out: they still see the passport, and the claim box invites
        // them to sign in, which is what an anonymous scan does anyway.
        setViewer(data ?? { signedIn: false, isOwner: false, pendingTransfer: false });
      })
      .catch(() => {
        if (!cancelled) {
          setViewer({ signedIn: false, isOwner: false, pendingTransfer: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  if (arrivedUnclaimed) {
    // Reserve the height the claim box will take, so the page does not jump
    // under someone's thumb as it arrives.
    if (!viewer) return <ClaimSkeleton />;
    return <ClaimForm qrToken={qrToken} signedIn={viewer.signedIn} t={t} />;
  }

  if (viewer?.isOwner) {
    return <TransferPanel serial={serial} hasPending={viewer.pendingTransfer} t={t} />;
  }

  return null;
}

function ClaimSkeleton() {
  return (
    <Card className="p-6 sm:p-7" aria-hidden>
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 rounded-lg bg-ink-800" />
        <div className="h-4 w-full max-w-sm rounded bg-ink-850" />
        <div className="h-14 w-full rounded-xl bg-ink-850" />
        <div className="h-12 w-full rounded-xl bg-ink-800" />
      </div>
    </Card>
  );
}
