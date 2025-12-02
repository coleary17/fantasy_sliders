import ScoreInput from './ScoreInput';
import { getGameResult } from '../data';

const GameControl = ({ game, teamData, onScoreChange }) => {
  const team1Score = teamData[game.team1].week14Score;
  const team2Score = teamData[game.team2].week14Score;
  const gameResult = getGameResult(team1Score, team2Score, game.team1, game.team2);

  const handleTeam1ScoreChange = (newScore) => {
    onScoreChange(game.team1, newScore);
  };

  const handleTeam2ScoreChange = (newScore) => {
    onScoreChange(game.team2, newScore);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
      {/* Mobile: Stack vertically, Desktop: Side by side */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 sm:space-x-2">
        {/* Team 1 */}
        <div className="flex-1 text-center sm:text-right">
          <div className="font-medium text-gray-900 mb-2 text-sm sm:text-base break-words">
            {game.team1}
          </div>
          <ScoreInput 
            score={team1Score}
            onScoreChange={handleTeam1ScoreChange}
            teamName={game.team1}
          />
        </div>

        {/* VS separator */}
        <div className="flex-shrink-0 text-lg sm:text-xl font-bold text-gray-500 text-center sm:px-2">
          VS
        </div>

        {/* Team 2 */}
        <div className="flex-1 text-center sm:text-left">
          <div className="font-medium text-gray-900 mb-2 text-sm sm:text-base break-words">
            {game.team2}
          </div>
          <ScoreInput 
            score={team2Score}
            onScoreChange={handleTeam2ScoreChange}
            teamName={game.team2}
          />
        </div>
      </div>

      {/* Game Result */}
      <div className="mt-3 sm:mt-4 text-center">
        <div className={`text-xs sm:text-sm font-medium break-words ${
          gameResult === 'TIE' 
            ? 'text-yellow-600' 
            : 'text-gray-700'
        }`}>
          Result: {gameResult}
        </div>
      </div>
    </div>
  );
};

export default GameControl;