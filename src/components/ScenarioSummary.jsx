import { getGameResult } from '../data';

const ScenarioSummary = ({ games, teamData }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
        Current Scenario
      </h3>
      
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Week 14 Results:
        </h4>
        
        {games.map((game) => {
          const team1Score = teamData[game.team1].week14Score;
          const team2Score = teamData[game.team2].week14Score;
          const result = getGameResult(team1Score, team2Score, game.team1, game.team2);
          
          return (
            <div key={game.id} className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              <span className="font-medium">{game.team1}</span> {team1Score} - {team2Score} <span className="font-medium">{game.team2}</span>
              <div className="text-xs text-gray-500 ml-2">
                {result}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScenarioSummary;