/**
 * AppContent — Routes between MiniBar (floating) and MainApp (full window).
 * Route determined by URL hash: #mini → MiniBar, otherwise → MainApp.
 */
import React, { useEffect } from 'react';
import MiniBar from './MiniBar/MiniBar';
import { MainApp } from './MainApp/MainApp';
import { OnboardingPopover } from './OnboardingPopover';

export function AppContent() {
  const isMini = window.location.hash === '#mini';

  useEffect(() => {
    if (isMini) {
      document.body.classList.add('mini-mode');
      document.documentElement.classList.add('mini-mode');
    } else {
      document.body.classList.remove('mini-mode');
      document.documentElement.classList.remove('mini-mode');
    }
  }, [isMini]);

  return (
    <>
      {isMini ? <MiniBar /> : <MainApp />}
      <OnboardingPopover isMini={isMini} />
    </>
  );
}
