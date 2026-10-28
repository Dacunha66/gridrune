import { ReactNode, useEffect, useState } from 'react';

/** Button that asks for a second tap instead of a browser dialog (dialogs can be blocked in embedded previews). */
export function ConfirmButton({ label, confirmLabel, onConfirm, ariaLabel, skipConfirm }: {
  label: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  ariaLabel?: string;
  skipConfirm?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`btn btn-small ${armed ? 'btn-danger' : ''}`}
      aria-label={armed ? confirmLabel : ariaLabel}
      onClick={() => (armed || skipConfirm ? onConfirm() : setArmed(true))}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
