/// <reference types="vite/client" />

// React 19's types no longer declare a global JSX namespace; components here
// annotate their return type as JSX.Element, so alias it to React's.
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
