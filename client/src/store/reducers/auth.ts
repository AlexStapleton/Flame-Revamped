import { Action } from '../actions';
import { ActionType } from '../action-types';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  // True while a stored token is being validated on page load (autoLogin).
  // Protected routes wait for it instead of redirecting a logged-in admin.
  checking: boolean;
}

const initialState: AuthState = {
  isAuthenticated: false,
  token: null,
  checking: Boolean(localStorage.getItem('token')),
};

export const authReducer = (
  state: AuthState = initialState,
  action: Action
): AuthState => {
  switch (action.type) {
    case ActionType.login:
      return {
        ...state,
        token: action.payload,
        isAuthenticated: true,
        checking: false,
      };

    case ActionType.logout:
      return {
        ...state,
        token: null,
        isAuthenticated: false,
        checking: false,
      };

    case ActionType.autoLogin:
      return {
        ...state,
        token: action.payload,
        isAuthenticated: true,
        checking: false,
      };

    case ActionType.authError:
      return {
        ...state,
        token: null,
        isAuthenticated: false,
        checking: false,
      };

    default:
      return state;
  }
};
