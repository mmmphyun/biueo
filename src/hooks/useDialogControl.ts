import { useEffect, type RefObject } from 'react';

/**
 * Modern Web Guidance (dialog / light-dismiss-a-dialog):
 * 네이티브 showModal() 제어 + closedby="any" 미지원 브라우저(Safari)용 바운딩 박스 폴백을 제공한다.
 */
export function useDialogControl(
  dialogRef: RefObject<HTMLDialogElement | null>,
  open: boolean,
  onClose: () => void
): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [dialogRef, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Safari 등 closedby="any" 미지원 환경용 백드롭 클릭 폴백
    let cleanupOutside: (() => void) | null = null;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const handlePointerDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const handlePointerUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', handlePointerDown);
      dialog.addEventListener('pointerup', handlePointerUp);
      cleanupOutside = () => {
        dialog.removeEventListener('pointerdown', handlePointerDown);
        dialog.removeEventListener('pointerup', handlePointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupOutside?.();
    };
  }, [dialogRef, onClose]);
}
