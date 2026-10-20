"use client";

// Submit button that asks "are you sure?" before its form is sent
export function ConfirmButton({ message, className, disabled, children }: {
  message: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={className}
      disabled={disabled}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
