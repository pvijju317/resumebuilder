import { EmptyState } from '@tailor/ui';
import { Hammer } from 'lucide-react';

/** Placeholder for sections delivered in later phases. */
export function SectionPage({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      icon={<Hammer />}
      title={`${title} is not available yet`}
      description={description}
    />
  );
}
