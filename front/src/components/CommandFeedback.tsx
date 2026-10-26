import { CheckCircle2, LoaderCircle } from 'lucide-react';

export default function CommandFeedback({
  feedback,
}: {
  feedback: { kind: 'pending' | 'success' | 'error'; message: string } | null;
}) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.kind === 'error' ? 'alert' : 'status'}
      className={`flex items-center gap-2 text-xs ${feedback.kind === 'error' ? 'text-red-500' : feedback.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
    >
      {feedback.kind === 'pending' && (
        <LoaderCircle size={14} aria-hidden="true" className="animate-spin shrink-0" />
      )}
      {feedback.kind === 'success' && (
        <CheckCircle2 size={14} aria-hidden="true" className="shrink-0" />
      )}
      {feedback.message}
    </p>
  );
}
