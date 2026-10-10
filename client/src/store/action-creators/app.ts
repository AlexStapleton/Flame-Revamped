import { ActionType } from '../action-types';
import { Dispatch } from 'redux';
import { ApiResponse, App, IconPaths, NewApp } from '../../interfaces';
import {
  AddAppAction,
  DeleteAppAction,
  GetAppsAction,
  PinAppAction,
  ReorderAppsAction,
  SetEditAppAction,
  SortAppsAction,
  UpdateAppAction,
} from '../actions/app';
import { http } from '../../utility/http';
import { applyAuth } from '../../utility';
import { primeIconCache } from '../../components/UI/Icons/Icon/iconCache';
import { State } from '../reducers';

export const getApps =
  () => async (dispatch: Dispatch<GetAppsAction<undefined | App[]>>) => {
    dispatch({
      type: ActionType.getApps,
      payload: undefined,
    });

    try {
      const res = await http.get<ApiResponse<App[]> & { icons?: IconPaths }>(
        '/api/apps',
        { headers: applyAuth() }
      );

      // Seed the icon cache before the cards render so they draw at once.
      primeIconCache(res.data.icons);

      dispatch({
        type: ActionType.getAppsSuccess,
        payload: res.data.data,
      });
    } catch (err) {
      console.log(err);
    }
  };

export const syncApps =
  () => async (dispatch: Dispatch<GetAppsAction<undefined | App[]>>) => {
    try {
      const res = await http.post<ApiResponse<App[]>>(
        '/api/apps/sync',
        {},
        { headers: applyAuth() }
      );

      dispatch({
        type: ActionType.getAppsSuccess,
        payload: res.data.data,
      });

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: 'Apps synced from Docker / Kubernetes',
        },
      });
    } catch (err) {
      console.log(err);
      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Error',
          message: 'App sync failed. Check Docker/Kubernetes settings.',
        },
      });
    }
  };

export const pinApp =
  (app: App) => async (dispatch: Dispatch<PinAppAction>) => {
    try {
      const { id, isPinned, name } = app;
      const res = await http.put<ApiResponse<App>>(
        `/api/apps/${id}`,
        {
          isPinned: !isPinned,
        },
        {
          headers: applyAuth(),
        }
      );

      const status = isPinned
        ? 'unpinned from Homescreen'
        : 'pinned to Homescreen';

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `App ${name} ${status}`,
        },
      });

      dispatch({
        type: ActionType.pinApp,
        payload: res.data.data,
      });
    } catch (err) {
      console.log(err);
    }
  };

export const addApp =
  (formData: NewApp | FormData) => async (dispatch: Dispatch<AddAppAction>) => {
    try {
      const res = await http.post<ApiResponse<App>>('/api/apps', formData, {
        headers: applyAuth(),
      });

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `App added`,
        },
      });

      await dispatch({
        type: ActionType.addAppSuccess,
        payload: res.data.data,
      });

      // Sort apps
      dispatch<any>(sortApps());
    } catch (err) {
      console.log(err);
    }
  };

export const deleteApp =
  (id: number) => async (dispatch: Dispatch<DeleteAppAction>) => {
    try {
      await http.delete<ApiResponse<{}>>(`/api/apps/${id}`, {
        headers: applyAuth(),
      });

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: 'App deleted',
        },
      });

      dispatch({
        type: ActionType.deleteApp,
        payload: id,
      });
    } catch (err) {
      console.log(err);
    }
  };

export const updateApp =
  (id: number, formData: NewApp | FormData) =>
  async (dispatch: Dispatch<UpdateAppAction>) => {
    try {
      const res = await http.put<ApiResponse<App>>(
        `/api/apps/${id}`,
        formData,
        {
          headers: applyAuth(),
        }
      );

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `App updated`,
        },
      });

      await dispatch({
        type: ActionType.updateApp,
        payload: res.data.data,
      });

      // Sort apps
      dispatch<any>(sortApps());
    } catch (err) {
      console.log(err);
    }
  };

export const reorderApps =
  (apps: App[]) => async (dispatch: Dispatch<ReorderAppsAction>) => {
    interface ReorderQuery {
      apps: {
        id: number;
        orderId: number;
      }[];
    }

    // Optimistic update: reorder the store immediately so dnd-kit's drop
    // animation lands the card in its new position. Awaiting the network first
    // makes the card snap back to its old spot and then jump once the request
    // resolves. Persisting happens in the background below.
    dispatch({
      type: ActionType.reorderApps,
      payload: apps,
    });

    try {
      const updateQuery: ReorderQuery = { apps: [] };

      apps.forEach((app, index) =>
        updateQuery.apps.push({
          id: app.id,
          orderId: index + 1,
        })
      );

      await http.put<ApiResponse<{}>>('/api/apps/0/reorder', updateQuery, {
        headers: applyAuth(),
      });
    } catch (err) {
      console.log(err);
    }
  };

export const sortApps =
  () => (dispatch: Dispatch<SortAppsAction>, getState: () => State) => {
    // useOrdering already lives in the config store (seeded by getConfig on boot
    // and refreshed on every updateConfig), so read it from state instead of
    // making a redundant GET /api/config on every app add/update.
    dispatch({
      type: ActionType.sortApps,
      payload: getState().config.config.useOrdering,
    });
  };

export const setEditApp =
  (app: App | null) => (dispatch: Dispatch<SetEditAppAction>) => {
    dispatch({
      type: ActionType.setEditApp,
      payload: app,
    });
  };
