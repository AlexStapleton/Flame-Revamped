import { ReactNode, useEffect, useRef, PointerEvent, MouseEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  id: number;
  children: ReactNode;
}

// Generic drag-to-sort wrapper used by the homescreen grids. Renders a grid
// cell that carries the dnd-kit drag listeners. A `distance` activation
// constraint on the sensor (set by the parent) lets clicks through to the
// card link while only a real drag starts a sort.
export const SortableItem = ({ id, children }: Props): JSX.Element => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // dnd-kit's PointerSensor doesn't stop the browser from firing a `click` on
  // pointerup after a drag — and since the card is an <a>, that trailing click
  // would open the app/bookmark. Remember that a drag happened and swallow the
  // next click (capture phase, before it reaches the link) so releasing a drag
  // never navigates. A plain click never sets isDragging, so it passes through.
  const draggedRef = useRef(false);

  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 'auto',
    cursor: 'grab',
    touchAction: 'none' as const,
  };

  // Reset the flag at the start of every new interaction so a drag that ends
  // without a trailing click can't suppress a later legitimate click.
  const composedListeners = {
    ...listeners,
    onPointerDown: (e: PointerEvent) => {
      draggedRef.current = false;
      (listeners as any)?.onPointerDown?.(e);
    },
  };

  const handleClickCapture = (e: MouseEvent) => {
    if (draggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      draggedRef.current = false;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...composedListeners}
      onClickCapture={handleClickCapture}
    >
      {children}
    </div>
  );
};
