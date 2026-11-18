import { useLocale } from "../i18n/locale";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import "./table-ui.css";

/**
 * Shows a native <dialog> as a modal while the component is mounted, and
 * puts focus back on whatever had it before. `onDismiss` runs on Escape and
 * on a click on the backdrop; pass null for a dialog the viewer cannot
 * dismiss, which then also reopens if the browser closes it anyway (Chrome
 * lets a repeated Escape through), so it never stays mounted but hidden.
 */
export function useModalDialog(onDismiss: (() => void) | null) {
  const ref = useRef<HTMLDialogElement>(null);
  // Read while rendering, before showModal moves focus into the dialog.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!;
    // Removing the element closes it. Calling close during Strict Mode's
    // effect replay would queue a close event and dismiss the reopened dialog.
    if (!dialog.open) dialog.showModal();
    return () => {
      // Only once the dialog is gone and focus fell back to the page, so
      // Strict Mode's replay and focus moved on purpose are left alone.
      if (document.activeElement === document.body) opener?.focus();
    };
  }, [opener]);
  return {
    ref,
    onCancel: (event: SyntheticEvent) => {
      if (!onDismiss) event.preventDefault();
    },
    onClose: () => {
      if (onDismiss) onDismiss();
      else if (ref.current && !ref.current.open) ref.current.showModal();
    },
    onClick: (event: SyntheticEvent) => {
      if (onDismiss && event.target === event.currentTarget) onDismiss();
    },
  };
}

/** A tilted sheet of lined paper in a modal dialog, with a round close button. */
export function PaperDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const modal = useModalDialog(onClose);
  const titleId = useId();
  return (
    <dialog className="tl-dialog" aria-labelledby={titleId} {...modal}>
      <div className="tl-paper">
        <button
          className="tl-close"
          aria-label={t("Close", "Fechar")}
          onClick={onClose}
          autoFocus
        >
          ×
        </button>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
