const StandingsRow = ({ team, isPlayoffCutoff }) => {
  const record = team.ties > 0 
    ? `${team.wins}-${team.losses}-${team.ties}`
    : `${team.wins}-${team.losses}`;

  return (
    <tr className={`
      ${team.inPlayoffs 
        ? 'bg-green-50 border-green-200' 
        : 'bg-gray-50 border-gray-200'
      }
      ${isPlayoffCutoff ? 'border-b-4 border-green-500' : 'border-b'}
      transition-colors duration-200
    `}>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-medium text-gray-900 text-sm">
        {team.rank}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-gray-900 min-w-0">
        <div className="text-xs sm:text-sm break-words leading-tight">
          {team.name}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-mono text-gray-700 text-xs sm:text-sm">
        {record}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-mono text-gray-700 text-xs sm:text-sm hidden sm:table-cell">
        {team.pointsFor.toFixed(0)}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
        <span className={`
          inline-flex items-center px-1.5 sm:px-2.5 py-0.5 rounded-full text-xs font-medium
          ${team.inPlayoffs 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
          }
        `}>
          <span className="hidden sm:inline">{team.inPlayoffs ? '✓ IN' : '✗ OUT'}</span>
          <span className="sm:hidden">{team.inPlayoffs ? '✓' : '✗'}</span>
        </span>
      </td>
    </tr>
  );
};

export default StandingsRow;