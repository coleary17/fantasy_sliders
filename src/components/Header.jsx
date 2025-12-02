const Header = () => {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 shadow-lg">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          The New World Order
        </h1>
        <div className="text-lg md:text-xl mb-1">
          Week 14 - Final Regular Season Week
        </div>
        <div className="text-base md:text-lg opacity-90 mb-2">
          Playoff spots available: 6
        </div>
        <div className="text-sm md:text-base opacity-80">
          Set game scores to explore playoff scenarios
        </div>
      </div>
    </div>
  );
};

export default Header;