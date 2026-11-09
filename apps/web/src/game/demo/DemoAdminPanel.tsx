import { useDemoStore } from './store';
import { DEMO_MOCK_ATTENDEES } from '../../data/demoBooths';
import './demo-ui.css';

export function DemoAdminPanel() {
  const showAdminPanel = useDemoStore((s) => s.showAdminPanel);
  const toggleAdminPanel = useDemoStore((s) => s.toggleAdminPanel);
  const resetAllProgress = useDemoStore((s) => s.resetAllProgress);
  const stats = useDemoStore((s) => s.stats);

  if (!showAdminPanel) return null;

  const handleSimulateAttendees = () => {
    alert('Simulated 10 other attendees completing demos! Leaderboard would update in production.');
  };

  const handlePopulateLeaderboard = () => {
    alert(`Leaderboard populated with ${DEMO_MOCK_ATTENDEES.length} mock players!`);
  };

  return (
    <div className="demo-admin-overlay" onClick={toggleAdminPanel}>
      <div className="demo-admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="demo-admin-panel__header">
          <h2 className="demo-admin-panel__title">🎮 Demo Mode Controls</h2>
          <button className="demo-admin-panel__close" onClick={toggleAdminPanel}>✕</button>
        </div>
        
        <div className="demo-admin-panel__section">
          <h3 className="demo-admin-panel__section-title">Your Progress</h3>
          <div className="demo-admin-panel__stats-grid">
            <div className="demo-admin-panel__stat-box">
              <div className="demo-admin-panel__stat-label">Booths Visited</div>
              <div className="demo-admin-panel__stat-value">{stats.boothsVisited}</div>
            </div>
            <div className="demo-admin-panel__stat-box">
              <div className="demo-admin-panel__stat-label">Demos Completed</div>
              <div className="demo-admin-panel__stat-value">{stats.demosCompleted}</div>
            </div>
            <div className="demo-admin-panel__stat-box">
              <div className="demo-admin-panel__stat-label">Total Points</div>
              <div className="demo-admin-panel__stat-value">{stats.totalPoints}</div>
            </div>
            <div className="demo-admin-panel__stat-box">
              <div className="demo-admin-panel__stat-label">Quizzes Correct</div>
              <div className="demo-admin-panel__stat-value">{stats.quizzesCorrect}</div>
            </div>
          </div>
        </div>
        
        <div className="demo-admin-panel__section">
          <h3 className="demo-admin-panel__section-title">Demo Actions</h3>
          <div className="demo-admin-panel__actions">
            <button className="demo-admin-panel__btn demo-admin-panel__btn--primary" onClick={handlePopulateLeaderboard}>
              👥 Populate Leaderboard ({DEMO_MOCK_ATTENDEES.length} players)
            </button>
            <button className="demo-admin-panel__btn demo-admin-panel__btn--secondary" onClick={handleSimulateAttendees}>
              🤖 Simulate Other Attendees
            </button>
            <button className="demo-admin-panel__btn demo-admin-panel__btn--danger" onClick={() => {
              if (confirm('Reset all demo progress? This cannot be undone.')) {
                resetAllProgress();
              }
            }}>
              🔄 Reset All Progress
            </button>
          </div>
        </div>
        
        <div className="demo-admin-panel__section">
          <h3 className="demo-admin-panel__section-title">Mock Leaderboard Preview</h3>
          <div className="demo-admin-panel__leaderboard">
            {DEMO_MOCK_ATTENDEES.slice(0, 10).map((att, idx) => (
              <div key={att.id} className="demo-admin-panel__lb-row">
                <span className="demo-admin-panel__lb-rank">#{idx + 1}</span>
                <span className="demo-admin-panel__lb-avatar">{att.avatar}</span>
                <span className="demo-admin-panel__lb-name">{att.name}</span>
                <span className="demo-admin-panel__lb-points">{att.totalPoints} pts</span>
                <span className="demo-admin-panel__lb-stats">{att.demosCompleted} demos</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="demo-admin-panel__footer">
          <p className="demo-admin-panel__note">
            💡 <strong>Demo Mode:</strong> This panel is for hackathon demonstration. 
            Press 🎮 button to toggle.
          </p>
        </div>
      </div>
    </div>
  );
}
