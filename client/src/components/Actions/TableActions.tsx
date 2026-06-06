import { Icon } from '../UI';
import classes from './TableActions.module.css';

interface Entity {
  id: number;
  name: string;
  isPinned?: boolean;
  isPublic: boolean;
  statusCheckEnabled?: boolean;
}

interface Props {
  entity: Entity;
  deleteHandler: (id: number, name: string) => void;
  updateHandler: (id: number) => void;
  pinHanlder?: (id: number) => void;
  changeVisibilty: (id: number) => void;
  showPin?: boolean;
  // Apps-only: toggle health-check monitoring. Bookmarks have no status, so the
  // action only renders when a handler is provided.
  statusHandler?: (id: number) => void;
  showStatus?: boolean;
}

export const TableActions = (props: Props): JSX.Element => {
  const {
    entity,
    deleteHandler,
    updateHandler,
    pinHanlder,
    changeVisibilty,
    showPin = true,
    statusHandler,
    showStatus = false,
  } = props;

  const _pinHandler = pinHanlder || function () {};
  const _statusHandler = statusHandler || function () {};

  return (
    <td className={classes.TableActions}>
      {/* DELETE */}
      <div
        className={classes.TableAction}
        onClick={() => deleteHandler(entity.id, entity.name)}
        tabIndex={0}
      >
        <Icon icon="mdiDelete" />
      </div>

      {/* UPDATE */}
      <div
        className={classes.TableAction}
        onClick={() => updateHandler(entity.id)}
        tabIndex={0}
      >
        <Icon icon="mdiPencil" />
      </div>

      {/* PIN */}
      {showPin && (
        <div
          className={classes.TableAction}
          onClick={() => _pinHandler(entity.id)}
          tabIndex={0}
        >
          {entity.isPinned ? (
            <Icon icon="mdiPinOff" color="var(--color-accent)" />
          ) : (
            <Icon icon="mdiPin" />
          )}
        </div>
      )}

      {/* VISIBILITY */}
      <div
        className={classes.TableAction}
        onClick={() => changeVisibilty(entity.id)}
        tabIndex={0}
      >
        {entity.isPublic ? (
          <Icon icon="mdiEyeOff" color="var(--color-accent)" />
        ) : (
          <Icon icon="mdiEye" />
        )}
      </div>

      {/* STATUS MONITORING (health check) — apps only */}
      {showStatus && (
        <div
          className={classes.TableAction}
          onClick={() => _statusHandler(entity.id)}
          tabIndex={0}
          title={`Status monitoring: ${
            entity.statusCheckEnabled ? 'on' : 'off'
          }`}
        >
          {entity.statusCheckEnabled ? (
            <Icon icon="mdiHeartPulse" color="var(--color-accent)" />
          ) : (
            <Icon icon="mdiHeartPulse" />
          )}
        </div>
      )}
    </td>
  );
};
