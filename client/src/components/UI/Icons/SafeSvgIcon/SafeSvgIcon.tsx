import { useEffect, useRef } from 'react';
import type DOMPurifyType from 'dompurify';

// SVG icon URLs are untrusted (Docker labels, ingress annotations, uploads,
// imported backups, external hosts). The SVG is fetched, sanitized with
// DOMPurify and only the sanitized root <svg> node is inserted inline, so
// theming via `fill="var(--color-primary)"` keeps working.

const SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: [
    'foreignObject',
    'script',
    'iframe',
    'use', // can pull in external content
    'a',
    'animate',
    'animateTransform',
    'animateMotion',
    'set', // can animate attributes (e.g. href) after sanitization
    'style', // unscoped CSS would leak into the host page
  ],
  FORBID_ATTR: ['href', 'xlink:href'],
  RETURN_DOM: true,
} as const;

// DOMPurify is only needed once an SVG icon is actually rendered, so it is
// loaded on demand (once) instead of living in the entry bundle. If the import
// fails the loader rejects and loadSvg() fails closed (renders nothing).
let purifyPromise: Promise<typeof DOMPurifyType> | null = null;
const loadPurify = (): Promise<typeof DOMPurifyType> => {
  if (!purifyPromise) {
    purifyPromise = import('dompurify').then((m) => m.default);
    purifyPromise.catch(() => {
      purifyPromise = null; // allow a retry on the next icon
    });
  }
  return purifyPromise;
};

const cache = new Map<string, Promise<SVGSVGElement | null>>();

const loadSvg = (url: string): Promise<SVGSVGElement | null> => {
  let pending = cache.get(url);

  if (!pending) {
    pending = Promise.all([
      fetch(url).then((res) => (res.ok ? res.text() : null)),
      loadPurify(),
    ])
      .then(([text, DOMPurify]) => {
        if (!text) return null;
        const body = DOMPurify.sanitize(text, {
          ...SANITIZE_CONFIG,
          FORBID_TAGS: [...SANITIZE_CONFIG.FORBID_TAGS],
          FORBID_ATTR: [...SANITIZE_CONFIG.FORBID_ATTR],
        }) as HTMLElement;
        const svg = body.querySelector('svg');
        if (!svg) return null;
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.removeAttribute('style');
        return svg as unknown as SVGSVGElement;
      })
      .catch(() => null);
    cache.set(url, pending);
  }

  return pending;
};

interface Props {
  src: string;
  className?: string;
  fill?: string;
}

export const SafeSvgIcon = ({
  src,
  className,
  fill = 'var(--color-primary)',
}: Props): JSX.Element => {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    const host = ref.current;
    host?.replaceChildren();

    loadSvg(src).then((svg) => {
      if (cancelled || !host || !svg) return;
      // Clone so each instance gets its own copy of the cached sanitized node
      const node = svg.cloneNode(true) as SVGSVGElement;
      if (className) node.setAttribute('class', className);
      node.setAttribute('fill', fill);
      host.replaceChildren(node);
    });

    return () => {
      cancelled = true;
    };
  }, [src, className, fill]);

  return <span ref={ref} style={{ display: 'contents' }} />;
};
