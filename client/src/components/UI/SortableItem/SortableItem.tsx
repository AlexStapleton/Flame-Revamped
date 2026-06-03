import { ReactNode } from 'react';
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
