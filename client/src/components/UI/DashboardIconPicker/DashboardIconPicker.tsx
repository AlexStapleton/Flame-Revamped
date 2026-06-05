import { useEffect, useState } from 'react';
import classes from './DashboardIconPicker.module.css';

interface Props {
  onSelect: (slug: string) => void;
}

const META_URL =
  'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/metadata.json';
const iconUrl = (slug: string) =>
  `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${slug}.svg`;

interface IconMeta {
  slug: string;
  aliases: string[];
}

// Fetched once and cached at module level (the metadata file is ~88KB).
let cache: IconMeta[] | null = null;
let cachePromise: Promise<IconMeta[]> | null = null;

const loadIcons = (): Promise<IconMeta[]> => {
  if (cache) return Promise.resolve(cache);
  if (!cachePromise) {
    cachePromise = fetch(META_URL)
      .then((r) => {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then((obj: Record<string, { aliases?: string[] }>) => {
        cache = Object.entries(obj).map(([slug, m]) => ({
          slug,
          aliases: m.aliases || [],
        }));
        return cache;
      });
  }
  return cachePromise;
};

const LIMIT = 48;

export const DashboardIconPicker = ({ onSelect }: Props): JSX.Element => {
  const [query, setQuery] = useState('');
  const [icons, setIcons] = useState<IconMeta[] | null>(cache);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadIcons()
      .then((i) => active && setIcons(i))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const results: IconMeta[] = !icons
    ? []
    : (q.length === 0
        ? icons
        : icons.filter(
            (i) =>
              i.slug.includes(q) ||
              i.aliases.some((a) => a.toLowerCase().includes(q))
          )
      ).slice(0, LIMIT);

  return (
    <div className={classes.Picker}>
      <input
        type="text"
        placeholder="Search app logos (e.g. plex, sonarr)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Don't submit the surrounding form when searching.
          if (e.key === 'Enter') e.preventDefault();
        }}
      />

      {error ? (
        <span className={classes.Msg}>
          Couldn't load logos (offline?). You can still type{' '}
          <code>dashboard:&lt;name&gt;</code> manually.
        </span>
      ) : !icons ? (
        <span className={classes.Msg}>Loading logos…</span>
      ) : results.length === 0 ? (
        <span className={classes.Msg}>No matches.</span>
      ) : (
        <div className={classes.Grid}>
          {results.map((i) => (
            <button
              type="button"
              key={i.slug}
              className={classes.IconBtn}
              title={i.slug}
              onClick={() => onSelect(i.slug)}
            >
              <img src={iconUrl(i.slug)} alt={i.slug} loading="lazy" />
              <span>{i.slug}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
