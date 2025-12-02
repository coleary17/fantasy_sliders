import { validateScore } from '../data';

const ScoreInput = ({ score, onScoreChange, teamName }) => {
  const handleSliderChange = (e) => {
    const newScore = Number(e.target.value);
    onScoreChange(newScore);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    // Allow temporary invalid input for typing, but validate on blur
    if (value === '') {
      onScoreChange('');
      return;
    }
    const validatedScore = validateScore(value);
    onScoreChange(validatedScore);
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
    <div className="flex flex-col items-center space-y-2">
      <input
        type="number"
        value={displayScore}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        className="w-14 sm:w-16 h-7 sm:h-8 text-center border border-gray-300 rounded text-xs sm:text-sm font-mono touch-manipulation"
        min="70"
        max="180"
        step="0.1"
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
        className="w-20 sm:w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
        style={{
          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sliderScore - 70) / 110) * 100}%, #e5e7eb ${((sliderScore - 70) / 110) * 100}%, #e5e7eb 100%)`
        }}
        aria-label={`Score slider for ${teamName}`}
      />
    </div>
  );
};

export default ScoreInput;