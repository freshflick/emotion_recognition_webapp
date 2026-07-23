interface WireframeAnnotationProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function WireframeAnnotation({ label, children, className = "" }: WireframeAnnotationProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute -top-6 left-0 text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 py-1 bg-white border border-gray-300 rounded z-10">
        {label}
      </div>
      {children}
    </div>
  );
}

interface WireframePlaceholderProps {
  type: "image" | "chart" | "content";
  height?: string;
  label?: string;
}

export function WireframePlaceholder({ type, height = "200px", label }: WireframePlaceholderProps) {
  return (
    <div
      className="wireframe-placeholder flex items-center justify-center"
      style={{ height, minHeight: height }}
    >
      <div className="text-center">
        <div className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-1">
          {label || type}
        </div>
        {type === "image" && (
          <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
        {type === "chart" && (
          <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )}
        {type === "content" && (
          <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </div>
    </div>
  );
}
