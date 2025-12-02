const QuickActions = ({ onResetAll, onRandomScores, standings }) => {
  const playoffTeams = standings.filter(team => team.inPlayoffs);
  const bubbleTeams = standings.slice(4, 8); // Teams ranked 5-8

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
        Quick Actions
      </h3>
      
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3 sm:mb-4">
        <button
          onClick={onResetAll}
          className="px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium text-sm sm:text-base touch-manipulation"
        >
          Reset All to 110
        </button>
        <button
          onClick={onRandomScores}
          className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm sm:text-base touch-manipulation"
        >
          Random Scores
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-xs sm:text-sm font-medium text-gray-900 mb-1">
            Teams in Playoff Spots:
          </h4>
          <div className="text-xs sm:text-sm text-gray-700 flex flex-wrap gap-1 leading-relaxed">
            {playoffTeams.map((team, index) => (
              <span key={team.name} className="break-words">
                {team.name}
                {index < playoffTeams.length - 1 && ', '}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs sm:text-sm font-medium text-gray-900 mb-1">
            Teams on the Bubble (Ranks 5-8):
          </h4>
          <div className="text-xs sm:text-sm text-gray-700 flex flex-wrap gap-1 leading-relaxed">
            {bubbleTeams.map((team, index) => (
              <span key={team.name} className={`break-words ${team.inPlayoffs ? 'text-green-600' : 'text-red-600'}`}>
                {team.rank}. {team.name}
                {index < bubbleTeams.length - 1 && ', '}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickActions;