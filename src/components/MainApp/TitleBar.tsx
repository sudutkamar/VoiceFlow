/**
 * TitleBar — Custom window title bar with drag region and controls.
 */
import React from 'react';
import { Iconify } from '../../utils/icons';
import appLogo from '../../assets/logo.png';

export function TitleBar() {
  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <div className="title-bar-logo">
          <img src={appLogo} alt="VoiceFlow" className="title-bar-logo-img" />
          <span>VoiceFlow</span>
        </div>
      </div>
      <div className="title-bar-controls">
        <button
          className="title-btn minimize"
          onClick={() => window.electronAPI.minimizeWindow()}
          title="Minimize"
        >
          <Iconify icon="minimize" size={16} />
        </button>
        <button
          className="title-btn maximize"
          onClick={() => window.electronAPI.maximizeWindow()}
          title="Maximize"
        >
          <Iconify icon="maximize" size={16} />
        </button>
        <button
          className="title-btn close"
          onClick={() => window.electronAPI.minimizeToBar()}
          title="Close"
        >
          <Iconify icon="closeWindow" size={16} />
        </button>
      </div>
    </div>
  );
}
