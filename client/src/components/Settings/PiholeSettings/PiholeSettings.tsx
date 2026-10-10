import { useState, ChangeEvent, useEffect, FormEvent } from 'react';
import { http } from '../../../utility/http';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';

// Typescript
import { ApiResponse, PiholeForm, PiholeStats } from '../../../interfaces';

// UI
import { InputGroup, Button, SettingsHeadline } from '../../UI';

// Utils
import {
  applyAuth,
  inputHandler,
  piholeSettingsTemplate,
} from '../../../utility';

export const PiholeSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { createNotification, updateConfig } = bindActionCreators(
    actionCreators,
    dispatch
  );

  // Initial state
  const [formData, setFormData] = useState<PiholeForm>(piholeSettingsTemplate);

  // Get config
  useEffect(() => {
    setFormData({
      piholeUrl: config.piholeUrl,
      PIHOLE_PASSWORD: config.PIHOLE_PASSWORD,
      piholeSkipTlsVerify: config.piholeSkipTlsVerify,
    });
  }, [loading]);

  // Form handler
  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    const piholeUrl = formData.piholeUrl.trim();
    if (piholeUrl && !/^https?:\/\//i.test(piholeUrl)) {
      createNotification({
        title: 'Error',
        message: 'Pi-hole address must start with http:// or https://',
      });
      return;
    }

    // Save settings
    await updateConfig({ ...formData, piholeUrl });

    // Empty address turns the widget off; nothing to test.
    if (!piholeUrl) return;

    // Test the connection right away so a wrong address or password shows up
    // here instead of as a missing widget.
    http
      .get<ApiResponse<PiholeStats | null>>('/api/pihole/update', {
        headers: applyAuth(),
      })
      .then(() => {
        createNotification({
          title: 'Success',
          message: 'Connected to Pi-hole',
        });
      })
      .catch((err) => {
        createNotification({
          title: 'Error',
          message: err.response?.data?.error || 'Could not reach Pi-hole',
        });
      });
  };

  // Input handler
  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<PiholeForm>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  return (
    <form onSubmit={(e) => formSubmitHandler(e)}>
      <SettingsHeadline text="Pi-hole" />
      {/* URL */}
      <InputGroup>
        <label htmlFor="piholeUrl">Pi-hole address</label>
        <input
          type="text"
          id="piholeUrl"
          name="piholeUrl"
          placeholder="http://pi.hole"
          value={formData.piholeUrl}
          onChange={(e) => inputChangeHandler(e)}
        />
        <span>
          Address of the Pi-hole web interface, as reached from the Flame
          server. Requires Pi-hole v6. Leave empty to hide the widget.
        </span>
      </InputGroup>

      {/* APP PASSWORD */}
      <InputGroup>
        <label htmlFor="PIHOLE_PASSWORD">App password</label>
        <input
          type="password"
          id="PIHOLE_PASSWORD"
          name="PIHOLE_PASSWORD"
          placeholder="secret"
          autoComplete="new-password"
          value={formData.PIHOLE_PASSWORD}
          onChange={(e) => inputChangeHandler(e)}
        />
        <span>
          Create one in Pi-hole under Settings &gt; Web interface / API &gt;
          Configure app password. Leave empty if your Pi-hole has no password.
          It stays on the Flame server and is never sent to visitors.
        </span>
      </InputGroup>

      {/* TLS */}
      <InputGroup>
        <label htmlFor="piholeSkipTlsVerify">Skip certificate check</label>
        <select
          id="piholeSkipTlsVerify"
          name="piholeSkipTlsVerify"
          value={formData.piholeSkipTlsVerify ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={0}>False</option>
          <option value={1}>True</option>
        </select>
        <span>
          Only for an https:// address with Pi-hole's built-in self-signed
          certificate.
        </span>
      </InputGroup>

      <Button>Save changes</Button>
    </form>
  );
};
