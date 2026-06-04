import { ReactNode } from 'react';
import classes from './Button.module.css';

interface Props {
  children: ReactNode;
  click?: any;
  // Defaults to 'submit' to preserve existing form-submit buttons. Pass
  // 'button' for actions that must not submit the surrounding form.
  type?: 'button' | 'submit' | 'reset';
}

export const Button = (props: Props): JSX.Element => {
  const { children, click, type = 'submit' } = props;

  return (
    <button
      type={type}
      className={classes.Button}
      onClick={click ? click : () => {}}
    >
      {children}
    </button>
  );
};
