export default function SplashScreen() {
  return (
    <div className="app-splash" role="status" aria-label="Loading Portal">
      <div className="app-splash__stage" aria-hidden="true">
        <img className="app-splash__piece app-splash__piece--phoenix" src="/sae-phoenix.png" alt="" />
        <img className="app-splash__piece app-splash__piece--shield" src="/sae-phoenix-shield.png" alt="" />
      </div>
    </div>
  );
}
