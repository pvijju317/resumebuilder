import { Button } from '@tailor/ui';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="tabular text-sm text-subtle">404</p>
      <h1 className="text-xl font-semibold tracking-tight text-text">Page not found</h1>
      <Button variant="secondary" asChild>
        <Link to="/">Go to home page</Link>
      </Button>
    </main>
  );
}
