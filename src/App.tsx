import LiquidCanvas from './features/liquid/LiquidCanvas';

const LOGO_TEXT = 'LIQUID';

function App() {
  return (
    <main className="liquid">
      <LiquidCanvas />
      <h1 className="logo">{LOGO_TEXT}</h1>
    </main>
  );
}

export default App;
