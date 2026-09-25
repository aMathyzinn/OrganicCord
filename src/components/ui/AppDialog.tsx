import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { type FormEvent, useEffect, useRef } from "react";

type DialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
};

function DialogShell({ open, onOpenChange, title, description, children }: DialogShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="app-dialog-overlay" />
        <Dialog.Content className="app-dialog-content" aria-describedby="app-dialog-description">
          <div className="app-dialog-header">
            <div className="app-dialog-icon"><AlertTriangle size={18} /></div>
            <div>
              <Dialog.Title className="app-dialog-title">{title}</Dialog.Title>
              <Dialog.Description id="app-dialog-description" className="app-dialog-description">{description}</Dialog.Description>
            </div>
            <Dialog.Close className="app-dialog-close" aria-label="Fechar"><X size={18} /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ConfirmDialogProps = Omit<DialogShellProps, "children"> & {
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
};

export function AppConfirmDialog({ confirmLabel, onConfirm, destructive = false, ...props }: ConfirmDialogProps) {
  const confirm = async () => {
    await onConfirm();
    props.onOpenChange(false);
  };

  return (
    <DialogShell {...props}>
      <div className="app-dialog-actions">
        <Dialog.Close className="app-dialog-button app-dialog-button-secondary">Cancelar</Dialog.Close>
        <button type="button" className={`app-dialog-button ${destructive ? "app-dialog-button-danger" : "app-dialog-button-primary"}`} onClick={() => void confirm()}>
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}

type TextDialogProps = Omit<DialogShellProps, "children"> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  submitLabel: string;
  onSubmit: () => void | Promise<void>;
  maxLength?: number;
};

export function AppTextDialog({ label, value, onValueChange, submitLabel, onSubmit, maxLength = 512, ...props }: TextDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [props.open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit();
    props.onOpenChange(false);
  };

  return (
    <DialogShell {...props}>
      <form onSubmit={(event) => void submit(event)}>
        <label className="app-dialog-field" htmlFor="app-dialog-text-input">{label}
          <input
            id="app-dialog-text-input"
            ref={inputRef}
            value={value}
            maxLength={maxLength}
            onChange={(event) => onValueChange(event.target.value)}
          />
        </label>
        <div className="app-dialog-actions">
          <Dialog.Close className="app-dialog-button app-dialog-button-secondary">Cancelar</Dialog.Close>
          <button type="submit" className="app-dialog-button app-dialog-button-primary">{submitLabel}</button>
        </div>
      </form>
    </DialogShell>
  );
}
