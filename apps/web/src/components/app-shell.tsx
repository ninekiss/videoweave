import type { ReactNode } from "react";
import Link from "next/link";
import {
  Boxes,
  Clapperboard,
  FolderKanban,
  Gauge,
  Home,
  Layers3,
  ListVideo,
  ScanLine,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ActiveNav = "workspace" | "projects" | "generate" | "analysis";

const liveNavigation = [
  { key: "workspace" as const, label: "Workspace", href: "/", icon: Home },
  { key: "projects" as const, label: "Projects", href: "/projects", icon: FolderKanban },
  { key: "generate" as const, label: "Generate", href: "/generate", icon: Sparkles },
  { key: "analysis" as const, label: "Shot Calibration", href: "/analysis", icon: ScanLine },
];

const upcomingNavigation = [
  ["Assets", Boxes],
  ["Replication", Clapperboard],
  ["Storyboard", Layers3],
  ["Jobs", Gauge],
  ["Results", ListVideo],
  ["Models", Boxes],
  ["Workflows", Workflow],
  ["Settings", Settings2],
] as const;

interface AppShellProps {
  active: ActiveNav;
  eyebrow: string;
  title: string;
  status?: string;
  children: ReactNode;
  inspector?: ReactNode;
}

export function AppShell({ active, eyebrow, title, status, children, inspector }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="border-b bg-card/40 px-4 py-4 lg:row-span-2 lg:border-b-0 lg:border-r lg:px-3 lg:py-6 xl:row-span-1">
          <div className="mb-4 flex items-center justify-between gap-3 px-2 lg:mb-7">
            <Link className="text-base font-semibold tracking-tight" href="/">
              VideoWeave
            </Link>
            <Badge className="lg:hidden" variant="outline">P0</Badge>
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
            {liveNavigation.map(({ key, label, href, icon: Icon }) => (
              <Link
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active === key
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                href={href}
                key={key}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-7 hidden space-y-1 border-t pt-5 lg:block">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Coming next
            </p>
            {upcomingNavigation.map(([label, Icon]) => (
              <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/45" key={label}>
                <Icon className="size-4" />
                {label}
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <header className="mb-6 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            </div>
            {status ? <Badge variant="outline">{status}</Badge> : null}
          </header>
          {children}
        </main>

        {inspector ? (
          <aside className="border-t bg-card/25 p-4 sm:p-6 lg:col-start-2 xl:col-start-3 xl:row-start-1 xl:h-screen xl:overflow-y-auto xl:border-l xl:border-t-0">
            {inspector}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
