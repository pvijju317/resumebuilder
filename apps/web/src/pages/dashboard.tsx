import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StrengthMeter,
} from '@tailor/ui';
import { FileText, KanbanSquare, Upload } from 'lucide-react';
import { useMe } from '../lib/auth.js';

export function DashboardPage() {
  const me = useMe();
  const firstName = me.data?.name?.split(' ')[0];
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        {me.isLoading ? (
          <Skeleton className="h-8 w-56" />
        ) : (
          <h2 className="text-xl font-semibold tracking-tight text-text">
            {firstName ? `Welcome, ${firstName}` : 'Welcome'}
          </h2>
        )}
        <p className="text-sm text-muted">
          Build your Career Vault once, then tailor it to every job.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Career Vault</CardTitle>
            <CardDescription>Your confirmed roles, achievements and metrics.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <StrengthMeter value={0} />
            <Button disabled>
              <Upload /> Upload resume
            </Button>
            <p className="text-xs text-subtle">Resume upload opens in the next release.</p>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <EmptyState
            icon={<FileText />}
            title="No tailored resumes yet"
            description="Tailored resumes you create will appear here with their before and after scores."
          />
          <EmptyState
            icon={<KanbanSquare />}
            title="No applications tracked"
            description="Applications you log will show here, along with which resume versions get callbacks."
          />
        </div>
      </div>
    </div>
  );
}
