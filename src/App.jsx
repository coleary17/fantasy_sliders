import { useState, useMemo } from 'react';
import Header from './components/Header';
import GameControls from './components/GameControls';
import StandingsTable from './components/StandingsTable';
import QuickActions from './components/QuickActions';
import ScenarioSummary from './components/ScenarioSummary';
import { initialTeamData, games, calculateStandings, validateScore } from './data';

function App() {
  const [teamData, setTeamData] = useState(initialTeamData);

  // Calculate standings whenever team data changes
  const standings = useMemo(() => {
    return calculateStandings(teamData, games);
  }, [teamData]);

  const handleScoreChange = (teamName, newScore) => {
    setTeamData(prev => ({
      ...prev,
      [teamName]: {
        ...prev[teamName],
        week14Score: typeof newScore === 'string' ? newScore : validateScore(newScore)
      }
    }));
  };

  const handleResetAll = () => {
    setTeamData(prev => {
      const resetData = { ...prev };
      Object.keys(resetData).forEach(teamName => {
        resetData[teamName] = {
          ...resetData[teamName],
          week14Score: 110
        };
      });
      return resetData;
    });
  };

  const handleRandomScores = () => {
    setTeamData(prev => {
      const randomData = { ...prev };
      Object.keys(randomData).forEach(teamName => {
        // Generate random scores in 95-145 range for realistic outcomes
        const randomScore = Math.round((Math.random() * 50 + 95) * 10) / 10;
        randomData[teamName] = {
          ...randomData[teamName],
          week14Score: randomScore
        };
      });
      return randomData;
    });
  };

  return (
    <div className="bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-12">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          {/* Left Column - Game Controls */}
          <div className="space-y-4 sm:space-y-6 order-2 xl:order-1">
            <GameControls 
              games={games}
              teamData={teamData}
              onScoreChange={handleScoreChange}
            />
            <QuickActions 
              onResetAll={handleResetAll}
              onRandomScores={handleRandomScores}
              standings={standings}
            />
          </div>

          {/* Right Column - Standings */}
          <div className="order-1 xl:order-2 space-y-4">
            <StandingsTable standings={standings} />
            <ScenarioSummary games={games} teamData={teamData} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;