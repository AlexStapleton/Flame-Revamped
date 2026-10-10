import classes from './AppGrid.module.css';
import { App } from '../../../interfaces/App';

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

import { AppCard } from '../AppCard/AppCard';
import { SortableItem } from '../../UI/SortableItem/SortableItem';
import { rebuildOrderFromPinned } from '../../../utility';
import { useDragClickGuard } from '../../../hooks/useDragClickGuard';

interface Props {
  apps: App[];
}

// Drag-reorderable app grid. Loaded lazily by AppGrid (React.lazy) so that
// @dnd-kit is only downloaded when reordering is actually possible
// (authenticated, custom order); guests get the plain grid.
export const AppGridSortable = ({ apps }: Props): JSX.Element => {
  const { apps: allApps } = useSelector((state: State) => state.apps);
  const dispatch = useDispatch();
  const { reorderApps } = bindActionCreators(actionCreators, dispatch);

  // Suppress the trailing click after a drag so reordering a card doesn't open it.
  const dragGuard = useDragClickGuard();

  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Let clicks through to the app link; only a real drag reorders.
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

    const oldIndex = apps.findIndex((a) => a.id === active.id);
    const newIndex = apps.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedPinned = arrayMove(apps, oldIndex, newIndex);
    const fullList = rebuildOrderFromPinned(allApps, reorderedPinned);
    reorderApps(fullList);
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
        items={apps.map((a) => a.id)}
        strategy={rectSortingStrategy}
      >
        <div className={classes.AppGrid}>
          {apps.map((app: App): JSX.Element => (
            <SortableItem key={app.id} id={app.id}>
              <AppCard app={app} />
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
