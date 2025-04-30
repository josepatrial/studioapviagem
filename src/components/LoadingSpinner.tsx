// src/components/LoadingSpinner.tsx
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react"; // Using lucide-react loader

interface LoadingSpinnerProps {
  className?: string;
}

export const LoadingSpinner = ({ className }: LoadingSpinnerProps) => {
  return (
    <Loader2 className={cn("h-8 w-8 animate-spin text-primary", className)} />
  );
};
