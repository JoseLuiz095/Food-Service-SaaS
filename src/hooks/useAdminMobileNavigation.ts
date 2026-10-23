import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps the mobile admin drawer usable by keyboard and prevents the page behind it from scrolling. */
export function useAdminMobileNavigation(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const desktop = window.matchMedia('(min-width: 821px)');
    if (desktop.matches) {
      setOpen(false);
      return;
    }

    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableItems = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    const frame = window.requestAnimationFrame(() => {
      const closeButton = sidebarRef.current?.querySelector<HTMLElement>('.admin-sidebar-close');
      (closeButton || focusableItems()[0])?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusableItems();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onDesktop);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onDesktop);
      document.body.style.overflow = priorOverflow;
      if (priorFocus?.isConnected) priorFocus.focus({ preventScroll: true });
    };
  }, [open, setOpen]);

  return { triggerRef, sidebarRef };
}
