import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
}

function Progress({ value, className }: ProgressProps) {
  const normalized = Math.min(Math.max(value, 0), 100);
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

export { Progress };
