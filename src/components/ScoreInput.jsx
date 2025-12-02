import { validateScore } from '../data';

const ScoreInput = ({ score, onScoreChange, teamName }) => {
  const handleSliderChange = (e) => {
    const newScore = Number(e.target.value);
    onScoreChange(newScore);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    // Allow temporary invalid input for typing
    if (value === '') {
      onScoreChange('');
      return;
    }
    // Don't validate immediately - let user type decimal values
    onScoreChange(value);
  };

  const handleInputBlur = (e) => {
    const value = e.target.value;
    if (value === '' || isNaN(value)) {
      onScoreChange(110); // Reset to default
    } else {
      const validatedScore = validateScore(value);
      onScoreChange(validatedScore);
    }
  };

  const displayScore = score === '' ? '' : score;
  const sliderScore = score === '' ? 110 : score;

  return (
    <div className="flex flex-col items-center space-y-3">
      <input
        type="number"
        value={displayScore}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        className="w-16 sm:w-20 h-8 sm:h-9 text-center border border-gray-300 rounded text-sm sm:text-base font-mono touch-manipulation focus:border-blue-500 focus:outline-none"
        min="70"
        max="180"
        step="0.1"
        placeholder="110.0"
        style={{ fontSize: '16px' }} // Prevents zoom on iOS
        aria-label={`Score for ${teamName}`}
      />
      <input
        type="range"
        min="70"
        max="180"
        step="0.1"
        value={sliderScore}
        onChange={handleSliderChange}
        className="w-32 sm:w-40 h-3 sm:h-4 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
        style={{
          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sliderScore - 70) / 110) * 100}%, #e5e7eb ${((sliderScore - 70) / 110) * 100}%, #e5e7eb 100%)`
        }}
        aria-label={`Score slider for ${teamName}`}
      />
      <div className="text-xs text-gray-500 font-mono">
        {sliderScore}
      </div>
    </div>
  );
};

export default ScoreInput;