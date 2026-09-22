import { Component, type ReactNode } from 'react';

export class AppBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (this.state.failed) return <main className="v3-app" style={{padding: 24}} role="alert">
      <h1>Не удалось открыть приложение</h1>
      <p>Попробуйте перезагрузить страницу. Сохранённый прогресс не сбрасывается.</p>
      <button onClick={() => window.location.reload()}>Перезагрузить</button>
    </main>;
    return this.props.children;
  }
}
