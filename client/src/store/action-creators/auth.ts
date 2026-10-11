import { Dispatch } from 'redux';
import { ApiResponse } from '../../interfaces';
import { ActionType } from '../action-types';
import {
  AuthErrorAction,
  AutoLoginAction,
  LoginAction,
  LogoutAction,
} from '../actions/auth';
import { http, HttpError } from '../../utility/http';
import { getApps, getCategories, getConfig } from '.';

export const login =
  (formData: { password: string; duration: string }) =>
  async (dispatch: Dispatch<LoginAction>) => {
    try {
      const res = await http.post<ApiResponse<{ token: string }>>(
        '/api/auth',
        formData
      );

      localStorage.setItem('token', res.data.data.token);

      dispatch({
        type: ActionType.login,
        payload: res.data.data.token,
      });

      dispatch<any>(getApps());
      dispatch<any>(getCategories());
      // The config loaded before login has the weather key and Pi-hole
      // secrets masked. Without a re-fetch, saving any settings form would
      // write the mask ("true") over the real key.
      dispatch<any>(getConfig());
    } catch (err) {
      dispatch<any>(authError(err, true));
    }
  };

export const logout = () => (dispatch: Dispatch<LogoutAction>) => {
  localStorage.removeItem('token');

  dispatch({
    type: ActionType.logout,
  });

  dispatch<any>(getApps());
  dispatch<any>(getCategories());
  // Drop the real secrets from memory again.
  dispatch<any>(getConfig());
};

export const autoLogin = () => async (dispatch: Dispatch<AutoLoginAction>) => {
  const token: string = localStorage.token;

  try {
    await http.post<ApiResponse<{ token: { isValid: boolean } }>>(
      '/api/auth/validate',
      { token }
    );

    dispatch({
      type: ActionType.autoLogin,
      payload: token,
    });

    // No re-fetch of apps/categories here: every list request already sends
    // the stored token (applyAuth), so whatever loaded them on this page load
    // got the authenticated data. Re-fetching only duplicated both requests
    // and re-rendered every card. An invalid token still re-fetches as a guest
    // (authError below).
  } catch (err) {
    dispatch<any>(authError(err, false));
  }
};

export const authError =
  (error: unknown, showNotification: boolean) =>
  (dispatch: Dispatch<AuthErrorAction>) => {
    const apiError = error as HttpError;

    // Ends the token check, so ProtectedRoute stops waiting.
    dispatch({ type: ActionType.authError });

    if (showNotification) {
      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Error',
          message: apiError.response?.data.error,
        },
      });
    }

    dispatch<any>(getApps());
    dispatch<any>(getCategories());
  };
