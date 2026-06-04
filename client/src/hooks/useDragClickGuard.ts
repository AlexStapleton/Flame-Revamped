import { useCallback, useEffect, useRef } from 'react';

/**
 * Works around a drag-then-click bug (most visible in Firefox).
 *
 * The app/bookmark cards are <a> links. After a dnd-kit reorder, the browser
 * fires a trailing `click` on the dragged element on pointerup — which navigates
 * and opens the card. The click's propagation gets stopped (so a component-level
 * onClickCapture can be halted before it runs), but `preventDefault` is never
 * called, so the native <a> navigation still happens.
 *
 * This guard installs a DOCUMENT-LEVEL, CAPTURE-PHASE click listener — it runs
 * before anything deeper can call stopPropagation — and calls preventDefault on
 * the single trailing click after a drag. The flag is flipped synchronously in
 * dnd-kit's onDragStart (no useEffect timing to race) and cleared on the next
 * macrotask, after the trailing click (which fires synchronously on pointerup).
 *
 * Wire it into a DndContext:
 *   const guard = useDragClickGuard();
 *   <DndContext onDragStart={guard.onDragStart}
 *               onDragEnd={(e) => { guard.onDragEnd(); handleDragEnd(e); }} />
 */
export const useDragClickGuard = () => {
  const draggingRef = useRef(false);

  useEffect(() => {
    const onClickCapture = (e: MouseEvent) => {
      if (draggingRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, []);

  const onDragStart = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const onDragEnd = useCallback(() => {
    // Keep the flag set through the trailing click, then release it.
    setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  }, []);

  return { onDragStart, onDragEnd };
};
