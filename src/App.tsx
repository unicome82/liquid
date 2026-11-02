import { useState } from 'react';
import ControlPanel from './features/controls/ControlPanel';
import LiquidCanvas from './features/liquid/LiquidCanvas';
import { DEFAULT_SETTINGS, isMetalTheme } from './shared/settings';

const LOGO_TEXT = 'LIQUID';
const COPYRIGHT_TEXT = 'COPYRIGHT ⓒ 2026 UNI';

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  return (
    <main className={`liquid${isMetalTheme(settings.theme) ? ' is-dark' : ''}`}>
      <LiquidCanvas settings={settings} />
      <h1 className="logo">{LOGO_TEXT}</h1>
      {/* Before the controls so the open sheet slides over it */}
      <footer className="copyright">
        <small>{COPYRIGHT_TEXT}</small>
      </footer>
      <ControlPanel settings={settings} onChange={setSettings} />
    </main>
  );
}

export default App;
