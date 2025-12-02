import GameControl from './GameControl';

const GameControls = ({ games, teamData, onScoreChange }) => {
  return (
    <div className="space-y-4 pb-16">
      <h2 className="text-base sm:text-xl font-bold text-gray-900 mb-4">
        Week 14 Games
      </h2>
      <div className="grid gap-4 md:gap-6">
        {games.map((game) => (
          <GameControl
            key={game.id}
            game={game}
            teamData={teamData}
            onScoreChange={onScoreChange}
          />
        ))}
      </div>
    </div>
  );
};

export default GameControls;