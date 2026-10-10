import { urlParser } from './urlParser';
import { isDangerousUrl } from './urlSafety';

export const redirectUrl = (url: string, sameTab: boolean) => {
  // Second guard: never navigate to script-capable schemes
  if (isDangerousUrl(url)) return;

  const parsedUrl = urlParser(url)[1];

  if (sameTab) {
    document.location.assign(parsedUrl);
  } else {
    window.open(parsedUrl);
  }
};
