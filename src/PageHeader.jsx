// On a phone this is one short line: the view's name is already on the tab bar.
export default function PageHeader({ view }) {
  return (
    <div className="bg-gradient-to-r from-blue-800 to-purple-800 px-3 py-2 text-white shadow-lg sm:p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-base font-bold sm:mb-2 sm:text-3xl md:text-4xl">The New World Order</h1>
        <div className="max-sm:sr-only sm:text-lg md:text-xl">{view}</div>
      </div>
    </div>
  );
}
