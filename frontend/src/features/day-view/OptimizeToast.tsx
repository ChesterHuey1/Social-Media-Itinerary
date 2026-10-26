import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import s from './DayView.module.css';

export type ToastState = { message: string; onUndo: (() => void) | null };

/** Says what Optimize route did, with Undo for 10 seconds. */
export function OptimizeToast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  return (
    <div className={s.toast} role="status">
      <Icon name="check" />
      <span>{toast.message}</span>
      {toast.onUndo && (
        <Button variant="text" onClick={toast.onUndo}>
          Undo
        </Button>
      )}
      <button type="button" className={s.toastClose} aria-label="Dismiss" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}
