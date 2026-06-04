import classes from './AppGrid.module.css';
import { Link } from 'react-router-dom';
import { App } from '../../../interfaces/App';

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

import { AppCard } from '../AppCard/AppCard';
import { Message, SortableItem } from '../../UI';
import { rebuildOrderFromPinned } from '../../../utility';
import { useDragClickGuard } from '../../../hooks/useDragClickGuard';

interface Props {
  apps: App[];
  totalApps?: number;
  searching: boolean;
  // When true (homescreen, authenticated, custom order), the pinned cards can
  // be drag-reordered. Other usages (/applications grid) leave this unset.
  sortable?: boolean;
}

export const AppGrid = (props: Props): JSX.Element => {
  const { apps: allApps } = useSelector((state: State) => state.apps);
  const dispatch = useDispatch();
  const { reorderApps } = bindActionCreators(actionCreators, dispatch);

  // Suppress the trailing click after a drag so reordering a card doesn't open it.
  const dragGuard = useDragClickGuard();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Let clicks through to the app link; only a real drag reorders.
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = props.apps.findIndex((a) => a.id === active.id);
    const newIndex = props.apps.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedPinned = arrayMove(props.apps, oldIndex, newIndex);
    const fullList = rebuildOrderFromPinned(allApps, reorderedPinned);
    reorderApps(fullList);
  };

  // Empty states (unchanged from the presentational version).
  if (!(props.searching || props.apps.length)) {
    return props.totalApps ? (
      <Message>
        There are no pinned applications. You can pin them from the{' '}
        <Link to="/applications">/applications</Link> menu
      </Message>
    ) : (
      <Message>
        You don't have any applications. You can add a new one from{' '}
        <Link to="/applications">/applications</Link> menu
      </Message>
    );
  }

  if (!props.apps.length) {
    return <Message>No apps match your search criteria</Message>;
  }

  const grid = (
    <div className={classes.AppGrid}>
      {props.apps.map((app: App): JSX.Element =>
        props.sortable ? (
          <SortableItem key={app.id} id={app.id}>
            <AppCard app={app} />
          </SortableItem>
        ) : (
          <AppCard key={app.id} app={app} />
        )
      )}
    </div>
  );

  if (!props.sortable) return grid;

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
        items={props.apps.map((a) => a.id)}
        strategy={rectSortingStrategy}
      >
        {grid}
      </SortableContext>
    </DndContext>
  );
};
