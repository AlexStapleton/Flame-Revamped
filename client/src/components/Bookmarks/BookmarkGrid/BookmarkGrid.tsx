import { Link } from 'react-router-dom';

import classes from './BookmarkGrid.module.css';

import { Category } from '../../../interfaces';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { Message, SortableItem } from '../../UI';
import { rebuildOrderFromPinned } from '../../../utility';

interface Props {
  categories: Category[];
  totalCategories?: number;
  searching: boolean;
  fromHomepage?: boolean;
  // When true (homescreen, authenticated, custom order), the pinned category
  // cards can be drag-reordered. The /bookmarks grid leaves this unset.
  sortable?: boolean;
}

export const BookmarkGrid = (props: Props): JSX.Element => {
  const {
    categories,
    totalCategories,
    searching,
    fromHomepage = false,
    sortable = false,
  } = props;

  const { categories: allCategories } = useSelector(
    (state: State) => state.bookmarks
  );
  const dispatch = useDispatch();
  const { reorderCategories } = bindActionCreators(actionCreators, dispatch);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Let clicks through to the bookmark links; only a real drag reorders.
      activationConstraint: { distance: 8 },
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

  // Empty / no-match states (unchanged from the presentational version).
  if (!categories.length) {
    return totalCategories ? (
      <Message>
        There are no pinned categories. You can pin them from the{' '}
        <Link to="/bookmarks">/bookmarks</Link> menu
      </Message>
    ) : (
      <Message>
        You don't have any bookmarks. You can add a new one from{' '}
        <Link to="/bookmarks">/bookmarks</Link> menu
      </Message>
    );
  }

  if (searching && !categories[0].bookmarks.length) {
    return <Message>No bookmarks match your search criteria</Message>;
  }

  const grid = (
    <div className={classes.BookmarkGrid}>
      {categories.map((category: Category): JSX.Element =>
        sortable ? (
          <SortableItem key={category.id} id={category.id}>
            <BookmarkCard category={category} fromHomepage={fromHomepage} />
          </SortableItem>
        ) : (
          <BookmarkCard
            category={category}
            fromHomepage={fromHomepage}
            key={category.id}
          />
        )
      )}
    </div>
  );

  if (!sortable) return grid;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={categories.map((c) => c.id)}
        strategy={rectSortingStrategy}
      >
        {grid}
      </SortableContext>
    </DndContext>
  );
};
