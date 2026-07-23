interface WireframeNotesProps {
  notes: string[];
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export function WireframeNotes({ notes, position = "bottom-right" }: WireframeNotesProps) {
  const positionClasses = {
    "top-left": "top-20 left-4",
    "top-right": "top-20 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-40 max-w-xs pointer-events-none`}>
      <div className="bg-yellow-100 border-2 border-yellow-400 p-3 rounded shadow-sm">
        <div className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider mb-2">
          Design Notes
        </div>
        <ul className="space-y-1">
          {notes.map((note, index) => (
            <li key={index} className="text-xs text-yellow-900 flex gap-2">
              <span className="text-yellow-600">•</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
