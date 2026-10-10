import { useState, useEffect, FormEvent } from 'react';
import { http } from '../../../utility/http';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';

// Typescript
import {
  ApiResponse,
  PiholeForm,
  PiholeInstance,
  PiholeResult,
} from '../../../interfaces';

// UI
import { InputGroup, Button, SettingsHeadline } from '../../UI';

// Utils
import { applyAuth, piholeSettingsTemplate } from '../../../utility';

// CSS
import classes from './PiholeSettings.module.css';

// Same limit as the server (utils/pihole.js MAX_PIHOLES).
const MAX_PIHOLES = 10;

// crypto.randomUUID needs a secure context, and Flame is often served over
// plain http on a LAN, so build a short random id instead.
const newId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const newPihole = (): PiholeInstance => ({
  id: newId(),
  name: '',
  url: '',
  version: 6,
  skipTlsVerify: false,
});

export const PiholeSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { createNotification, updateConfig } = bindActionCreators(
    actionCreators,
    dispatch
  );

  const [formData, setFormData] = useState<PiholeForm>(piholeSettingsTemplate);

  // Get config
  useEffect(() => {
    setFormData({
      piholes: (config.piholes || []).map((p) => ({ ...p })),
      PIHOLE_SECRETS: { ...(config.PIHOLE_SECRETS || {}) },
    });
  }, [loading]);

  const updatePihole = (id: string, changes: Partial<PiholeInstance>) => {
    setFormData((prev) => ({
      ...prev,
      piholes: prev.piholes.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }));
  };

  const updateSecret = (id: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      PIHOLE_SECRETS: { ...prev.PIHOLE_SECRETS, [id]: value },
    }));
  };

  const addPihole = () => {
    setFormData((prev) => ({ ...prev, piholes: [...prev.piholes, newPihole()] }));
  };

  const removePihole = (id: string) => {
    setFormData((prev) => {
      const secrets = { ...prev.PIHOLE_SECRETS };
      delete secrets[id];
      return {
        piholes: prev.piholes.filter((p) => p.id !== id),
        PIHOLE_SECRETS: secrets,
      };
    });
  };

  // Form handler
  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    const piholes = formData.piholes.map((p) => ({
      ...p,
      name: p.name.trim(),
      url: (p.url || '').trim(),
    }));

    const invalid = piholes.find((p) => !/^https?:\/\/\S+/i.test(p.url));
    if (invalid) {
      createNotification({
        title: 'Error',
        message: `Address of ${invalid.name || 'a Pi-hole'} must start with http:// or https://`,
      });
      return;
    }

    // Only keep secrets for Pi-holes that still exist.
    const PIHOLE_SECRETS: Record<string, string> = {};
    for (const p of piholes) {
      const secret = formData.PIHOLE_SECRETS[p.id];
      if (secret) PIHOLE_SECRETS[p.id] = secret;
    }

    // Save settings
    await updateConfig({ piholes, PIHOLE_SECRETS });

    if (piholes.length === 0) return;

    // Test every Pi-hole right away so a wrong address or password shows up
    // here instead of as an "unreachable" row on the homescreen.
    http
      .get<ApiResponse<PiholeResult[]>>('/api/pihole/update', {
        headers: applyAuth(),
      })
      .then((res) => {
        const results = res.data.data || [];
        const failed = results.filter((r) => !r.ok);
        if (failed.length === 0) {
          createNotification({
            title: 'Success',
            message:
              results.length === 1
                ? 'Connected to Pi-hole'
                : `Connected to all ${results.length} Pi-holes`,
          });
        }
        for (const r of failed) {
          createNotification({
            title: 'Error',
            message: `${r.name}: ${r.ok ? '' : r.error}`,
          });
        }
      })
      .catch((err) => {
        createNotification({
          title: 'Error',
          message: err.response?.data?.error || 'Could not reach Pi-hole',
        });
      });
  };

  return (
    <form onSubmit={(e) => formSubmitHandler(e)}>
      {formData.piholes.length === 0 && (
        <>
          <SettingsHeadline text="Pi-hole" />
          <p>
            No Pi-holes yet. Add one to show its stats in the homescreen
            header.
          </p>
        </>
      )}

      {formData.piholes.map((p, i) => {
        const v5 = p.version === 5;
        const nameId = `pihole-name-${p.id}`;
        const urlId = `pihole-url-${p.id}`;
        const versionId = `pihole-version-${p.id}`;
        const secretId = `pihole-secret-${p.id}`;
        const tlsId = `pihole-tls-${p.id}`;

        return (
          <div key={p.id} className={classes.Entry}>
            <SettingsHeadline text={p.name.trim() || `Pi-hole ${i + 1}`} />

            <InputGroup>
              <label htmlFor={nameId}>Name</label>
              <input
                type="text"
                id={nameId}
                placeholder="Pi-hole"
                maxLength={40}
                value={p.name}
                onChange={(e) => updatePihole(p.id, { name: e.target.value })}
              />
              <span>Shown next to its stats on the homescreen.</span>
            </InputGroup>

            <InputGroup>
              <label htmlFor={urlId}>Address</label>
              <input
                type="text"
                id={urlId}
                placeholder="http://192.168.1.2"
                value={p.url || ''}
                onChange={(e) => updatePihole(p.id, { url: e.target.value })}
              />
              <span>
                Address of the Pi-hole web interface, as reached from the
                Flame server.
              </span>
            </InputGroup>

            <InputGroup>
              <label htmlFor={versionId}>Pi-hole version</label>
              <select
                id={versionId}
                value={v5 ? 5 : 6}
                onChange={(e) =>
                  updatePihole(p.id, {
                    version: Number(e.target.value) === 5 ? 5 : 6,
                  })
                }
              >
                <option value={6}>v6</option>
                <option value={5}>v5</option>
              </select>
            </InputGroup>

            <InputGroup>
              <label htmlFor={secretId}>{v5 ? 'API token' : 'App password'}</label>
              <input
                type="password"
                id={secretId}
                placeholder="secret"
                autoComplete="new-password"
                value={formData.PIHOLE_SECRETS[p.id] || ''}
                onChange={(e) => updateSecret(p.id, e.target.value)}
              />
              <span>
                {v5
                  ? 'In Pi-hole, open Settings > API / Web interface and click Show API token.'
                  : 'In Pi-hole, open Settings > Web interface / API and use Configure app password. Leave empty if your Pi-hole has no password.'}{' '}
                It stays on the Flame server and is never sent to visitors.
              </span>
            </InputGroup>

            <InputGroup>
              <label htmlFor={tlsId}>Skip certificate check</label>
              <select
                id={tlsId}
                value={p.skipTlsVerify ? 1 : 0}
                onChange={(e) =>
                  updatePihole(p.id, { skipTlsVerify: e.target.value === '1' })
                }
              >
                <option value={0}>False</option>
                <option value={1}>True</option>
              </select>
              <span>
                Only for an https:// address with a self-signed certificate.
              </span>
            </InputGroup>

            <Button type="button" click={() => removePihole(p.id)}>
              Remove {p.name.trim() || `Pi-hole ${i + 1}`}
            </Button>
          </div>
        );
      })}

      {formData.piholes.length < MAX_PIHOLES && (
        <Button type="button" click={addPihole}>
          Add Pi-hole
        </Button>
      )}

      <Button>Save changes</Button>
    </form>
  );
};
