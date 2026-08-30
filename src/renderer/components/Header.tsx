import React from 'react';

import type { DeviceSummary, ViewState } from '../../spotify/types.js';

export function Header({
  devices,
  loadDevices,
  onChoosePlaylist,
  onSelectDevice,
  status,
  view,
}: {
  devices: DeviceSummary[];
  loadDevices(): Promise<void>;
  onChoosePlaylist(): void;
  onSelectDevice(deviceId: string): void;
  status: { message: string; state: 'error' | 'ok' };
  view: ViewState;
}) {
  const activeId = view.playback?.device?.id ?? '';
  const hasActiveDevice = devices.some((item) => item.id === activeId);
  return (
    <header className="context-bar">
      <button
        className="context-button"
        type="button"
        title="Choose playlist"
        aria-label="Choose playlist"
        onClick={onChoosePlaylist}
      >
        {view.context.name ??
          (view.playback ? 'Unknown context' : 'No active playback')}
      </button>
      <label className="device-picker" title="Spotify Connect device">
        <select
          id="device"
          aria-label="Spotify Connect device"
          disabled={devices.length === 0}
          value={hasActiveDevice ? activeId : ''}
          onFocus={() => void loadDevices()}
          onPointerDown={() => void loadDevices()}
          onChange={(event) => {
            const deviceId = event.currentTarget.value;
            event.currentTarget.blur();
            onSelectDevice(deviceId);
          }}
        >
          <option value="">
            {devices.length > 0
              ? 'Choose device'
              : view.playback?.device?.name ?? 'No device'}
          </option>
          {devices.map((item) => (
            <option
              key={item.id ?? item.name}
              value={item.id ?? ''}
              disabled={item.id === null || item.isRestricted}
            >
              {item.name}{item.isRestricted ? ' · restricted' : ''}
            </option>
          ))}
        </select>
      </label>
      <span id="connection" className={status.state} role="status">
        {status.message}
      </span>
    </header>
  );
}
