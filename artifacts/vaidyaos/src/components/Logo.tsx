import React from "react";

export function Logo() {
  return (
    <div className="flex flex-col items-center justify-center space-y-1">
      <div className="flex items-center space-x-2 text-primary">
        <svg 
          width="32" 
          height="32" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <span className="text-3xl font-bold tracking-tight font-serif text-foreground">
          Vaidya<span className="text-primary">OS</span>
        </span>
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        Bolo, prescription taiyaar / आवाज़ से प्रिस्क्रिप्शन
      </p>
    </div>
  );
}
