import { useState } from 'react';
import ControlPanel from './features/controls/ControlPanel';
import FontSelect from './features/controls/FontSelect';
import LiquidCanvas from './features/liquid/LiquidCanvas';
import { DEFAULT_SETTINGS, isMetalTheme } from './shared/settings';

const LOGO_TEXT = 'LIQUID';

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  return (
    <main className={`liquid${isMetalTheme(settings.theme) ? ' is-dark' : ''}`}>
      <LiquidCanvas settings={settings} />
      <h1 className="logo">{LOGO_TEXT}</h1>
      <FontSelect value={settings.font} onChange={(font) => setSettings({ ...settings, font })} />
      <ControlPanel settings={settings} onChange={setSettings} />
    </main>
  );
}

export default App;
