import * as React from "react";

import { cn } from "@/lib/utils";

function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative w-full rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200", className)}
      role="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 className={cn("mb-1 font-medium leading-none", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm leading-6 text-red-200/80", className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
