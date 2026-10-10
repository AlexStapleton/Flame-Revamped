import classes from './BookmarkGrid.module.css';

import { Category } from '../../../interfaces';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { State } from '../../../store/reducers';
import { actionCreators } from '../../../store';

import { BookmarkCard } from '../BookmarkCard/BookmarkCard';
import { SortableItem } from '../../UI/SortableItem/SortableItem';
import { rebuildOrderFromPinned } from '../../../utility';
import { useDragClickGuard } from '../../../hooks/useDragClickGuard';

interface Props {
  categories: Category[];
  fromHomepage: boolean;
}

// Drag-reorderable category grid. Loaded lazily by BookmarkGrid (React.lazy) so
// @dnd-kit is only downloaded when reordering is actually possible.
export const BookmarkGridSortable = ({
  categories,
  fromHomepage,
}: Props): JSX.Element => {
  const { categories: allCategories } = useSelector(
    (state: State) => state.bookmarks
  );
  const dispatch = useDispatch();
  const { reorderCategories } = bindActionCreators(actionCreators, dispatch);

  // Suppress the trailing click after a drag so reordering doesn't open a bookmark.
  const dragGuard = useDragClickGuard();

  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Let clicks through to the bookmark links; only a real drag reorders.
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      // Press-and-hold to reorder on touch; a quick swipe scrolls the page
      // instead (movement beyond `tolerance` before `delay` aborts the drag).
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedPinned = arrayMove(categories, oldIndex, newIndex);
    const fullList = rebuildOrderFromPinned(allCategories, reorderedPinned);
    reorderCategories(fullList);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={dragGuard.onDragStart}
      onDragEnd={(e) => {
        dragGuard.onDragEnd();
        handleDragEnd(e);
      }}
    >
      <SortableContext
        items={categories.map((c) => c.id)}
        strategy={rectSortingStrategy}
      >
        <div className={classes.BookmarkGrid}>
          {categories.map((category: Category): JSX.Element => (
            <SortableItem key={category.id} id={category.id}>
              <BookmarkCard category={category} fromHomepage={fromHomepage} />
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
