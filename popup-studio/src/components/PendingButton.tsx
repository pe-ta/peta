"use client";

import { useFormStatus } from "react-dom";

/** Submit button that shows progress while its form's server action runs. */
export function PendingButton({ children, pendingText, className = "btn-primary", disabled, formAction, name, value, title }: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
  name?: string;
  value?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} formAction={formAction} name={name} value={value} title={title} aria-busy={pending}>
      {pending ? (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
