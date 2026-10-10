import { ReactNode } from 'react';
import classes from './Button.module.css';

interface Props {
  children: ReactNode;
  click?: any;
  // Defaults to 'submit' to preserve existing form-submit buttons. Pass
  // 'button' for actions that must not submit the surrounding form.
  type?: 'button' | 'submit' | 'reset';
  // Extra class for layout tweaks (spacing, width) on top of the base style.
  className?: string;
}

export const Button = (props: Props): JSX.Element => {
  const { children, click, type = 'submit', className } = props;

  return (
    <button
      type={type}
      className={className ? `${classes.Button} ${className}` : classes.Button}
      onClick={click ? click : () => {}}
    >
      {children}
    </button>
  );
};
