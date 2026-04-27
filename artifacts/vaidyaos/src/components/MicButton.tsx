import React from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface MicButtonProps {
  isRecording: boolean;
  onClick: () => void;
}

export function MicButton({ isRecording, onClick }: MicButtonProps) {
  return (
    <div className="relative flex items-center justify-center py-8">
      {isRecording && (
        <>
          <div className="absolute w-32 h-32 rounded-full bg-primary/20 animate-ping" />
          <div className="absolute w-40 h-40 rounded-full bg-primary/10 animate-ping delay-150" />
        </>
      )}
      
      <button
        onClick={onClick}
        className={cn(
          "relative z-10 flex items-center justify-center w-24 h-24 rounded-full shadow-lg transition-all duration-300 ease-out",
          isRecording 
            ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30 scale-105" 
            : "bg-primary hover:bg-primary/90 text-white shadow-primary/30 hover:scale-105"
        )}
      >
        {isRecording ? (
          <Square className="w-8 h-8 fill-current" />
        ) : (
          <Mic className="w-10 h-10" />
        )}
      </button>
      
      {isRecording && (
        <span className="absolute -bottom-2 text-sm font-medium text-red-500 animate-pulse">
          Recording...
        </span>
      )}
    </div>
  );
}
