import type { VaultDraft, VaultImportDto } from '@tailor/shared';
import { Skeleton } from '@tailor/ui';
import { useState } from 'react';
import { useMe } from '../lib/auth.js';
import { BuildPanel, ImportProgress } from './build-panel.js';
import { ConsentCard } from './consent.js';
import { VaultEditor } from './editor.js';
import { useLatestImport, useVault } from './hooks.js';
import { ReviewImport } from './review.js';

export function VaultPage() {
  const me = useMe();
  const vault = useVault();
  const latest = useLatestImport();
  const [importing, setImporting] = useState(false);

  if (me.isLoading || vault.isLoading || latest.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const imp = latest.data;
  if (imp && imp.status === 'ready' && imp.draft)
    return <ReviewImport key={imp.id} imp={imp as VaultImportDto & { draft: VaultDraft }} />;
  if (imp && ['queued', 'parsing', 'failed'].includes(imp.status))
    return <ImportProgress imp={imp} />;

  if (!vault.data || importing) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {me.data?.consentAt ? (
          <BuildPanel title={vault.data ? 'Import another resume' : undefined} />
        ) : (
          <ConsentCard />
        )}
      </div>
    );
  }
  return <VaultEditor vault={vault.data} onImport={() => setImporting(true)} />;
}
