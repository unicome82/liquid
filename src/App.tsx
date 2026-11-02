import { useState } from 'react';
import ControlPanel from './features/controls/ControlPanel';
import InteractionHint from './features/hint/InteractionHint';
import LiquidCanvas from './features/liquid/LiquidCanvas';
import { DEFAULT_SETTINGS } from './shared/settings';

const LOGO_TEXT = 'LIQUID';

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  return (
    <main className="liquid">
      <LiquidCanvas settings={settings} />
      <h1 className="logo">{LOGO_TEXT}</h1>
      <InteractionHint mode={settings.mode} />
      <ControlPanel settings={settings} onChange={setSettings} />
    </main>
  );
}

export default App;
