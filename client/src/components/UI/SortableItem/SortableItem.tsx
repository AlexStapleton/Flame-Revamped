import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  id: number;
  children: ReactNode;
}

// Generic drag-to-sort wrapper used by the homescreen grids. Suppressing the
// trailing click after a drag (so reordering a card doesn't open it) is handled
// by the grid's DndContext via useDragClickGuard — a document-level capture
// handler is the only reliable place, because the post-drag click's propagation
// gets stopped before it would reach a handler attached here.
export const SortableItem = ({ id, children }: Props): JSX.Element => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 'auto',
    cursor: 'grab',
    touchAction: 'none' as const,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};
