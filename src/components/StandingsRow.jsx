const StandingsRow = ({ team, isPlayoffCutoff }) => {
  const record = team.ties > 0 
    ? `${team.wins}-${team.losses}-${team.ties}`
    : `${team.wins}-${team.losses}`;

  return (
    <tr className={`
      ${team.inPlayoffs 
        ? 'bg-green-950/50 border-green-800' 
        : 'bg-page border-line'
      }
      ${isPlayoffCutoff ? 'border-b-4 border-green-500' : 'border-b'}
      transition-colors duration-200
    `}>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-medium text-ink text-sm">
        {team.rank}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-ink min-w-0">
        <div className="text-xs sm:text-sm break-words leading-tight">
          {team.name}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-mono text-ink-2 text-xs sm:text-sm">
        {record}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-mono text-ink-2 text-xs sm:text-sm hidden sm:table-cell">
        {team.pointsFor.toFixed(0)}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
        <span className={`
          inline-flex items-center px-1.5 sm:px-2.5 py-0.5 rounded-full text-xs font-medium
          ${team.inPlayoffs 
            ? 'bg-green-900/50 text-green-300' 
            : 'bg-red-900/50 text-red-300'
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