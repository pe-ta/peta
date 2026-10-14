"use client";

/** Submit button that asks for confirmation first. Used for destructive actions. */
export function ConfirmButton({ children, message, className = "btn-ghost", name, value }: { children: React.ReactNode; message: string; className?: string; name?: string; value?: string }) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
