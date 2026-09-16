'use client';

import { useFormStatus } from 'react-dom';

// A normal <button type="submit"> stays clickable while the server action is
// still running -- on a slow connection that lets someone click it 2-3 times
// before the page navigates away, creating duplicate rows (this happened to
// Tin: 4x family group, 5x ancestor, all from one submit). This component
// disables itself the moment the form starts submitting, using React's
// useFormStatus, shows a spinning icon so it's obvious something is
// happening, and re-enables automatically if the action fails.
export default function SubmitButton({
  children,
  pendingText = 'Saving…',
  className = 'btn',
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {pending ? pendingText : children}
    </button>
  );
}