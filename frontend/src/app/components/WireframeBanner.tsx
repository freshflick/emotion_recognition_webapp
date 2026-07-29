export function WireframeBanner() {
  return (
    <>
      {/* Top Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white py-2 px-4 border-b-2 border-gray-700">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            </div>
            <div className="border-l border-gray-600 pl-3">
              <div className="text-xs font-bold tracking-wider">WIREFRAME PROTOTYPE</div>
            </div>
          </div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Design Proposal Phase - Not Final UI
          </div>
        </div>
      </div>

      {/* Corner Ribbon */}
      <div className="fixed top-12 right-0 z-50 pointer-events-none">
        <div className="bg-gray-700 text-white px-8 py-1 transform rotate-45 translate-x-8 translate-y-6 shadow-lg">
          <div className="text-[10px] font-bold tracking-widest">DRAFT</div>
        </div>
      </div>
    </>
  );
}
