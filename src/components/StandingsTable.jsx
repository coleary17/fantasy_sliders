import StandingsRow from './StandingsRow';

const StandingsTable = ({ standings }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          Current Standings
        </h2>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Top 6 teams make the playoffs
        </p>
      </div>
      
      <div className="overflow-x-auto -mx-3 sm:mx-0">
        <div className="px-3 sm:px-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-center">
                  #
                </th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-0">
                  Team
                </th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-center">
                  W-L
                </th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-center hidden sm:table-cell">
                  Points
                </th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {standings.map((team, index) => (
                <StandingsRow
                  key={team.name}
                  team={team}
                  isPlayoffCutoff={index === 5} // Add thick border after 6th place
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StandingsTable;