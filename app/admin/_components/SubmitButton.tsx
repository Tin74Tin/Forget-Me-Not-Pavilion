'use client';

import { useFormStatus } from 'react-dom';

// A normal <button type="submit"> stays clickable while the server action is
// still running -- on a slow connection that lets someone click it 2-3 times
// before the page navigates away, creating duplicate rows (this happened to
// Tin: 4x family group, 5x ancestor, all from one submit). This component
// disables itself the moment the form starts submitting, using React's
// useFormStatus, and re-enables automatically if the action fails.
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
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingText : children}
    </button>
  );
}