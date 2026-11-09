import { useDemoStore } from './store';
import './demo-ui.css';

export function DemoProgressUI() {
  const stats = useDemoStore((s) => s.stats);
  const toggleAdminPanel = useDemoStore((s) => s.toggleAdminPanel);

  return (
    <div className="demo-progress-panel">
      <button className="demo-progress-panel__toggle" onClick={toggleAdminPanel} title="Demo Controls">
        🎮
      </button>
      <div className="demo-progress-panel__stats">
        <div className="demo-progress-panel__stat" title="Booths Visited">
          <span className="demo-progress-panel__stat-icon">🏢</span>
          <span className="demo-progress-panel__stat-value">{stats.boothsVisited}/{stats.totalBooths}</span>
        </div>
        <div className="demo-progress-panel__stat" title="Demos Completed">
          <span className="demo-progress-panel__stat-icon">✅</span>
          <span className="demo-progress-panel__stat-value">{stats.demosCompleted}/{stats.totalBooths}</span>
        </div>
        <div className="demo-progress-panel__stat" title="Total Points">
          <span className="demo-progress-panel__stat-icon">⭐</span>
          <span className="demo-progress-panel__stat-value">{stats.totalPoints}</span>
        </div>
        <div className="demo-progress-panel__stat" title="Completion">
          <span className="demo-progress-panel__stat-icon">📊</span>
          <span className="demo-progress-panel__stat-value">{stats.completionPercentage}%</span>
        </div>
      </div>
    </div>
  );
}
