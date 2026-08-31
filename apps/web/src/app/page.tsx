import type { LucideIcon } from "lucide-react";
import { Clapperboard, FolderOpen, ScanLine, Sparkles, Workflow } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface QuickAction {
  title: string;
  description: string;
  href?: string;
  icon: LucideIcon;
  badge: string;
}

const quickActions: QuickAction[] = [
  {
    title: "Generate video",
    description: "Run T2V or I2V through the registry-resolved ComfyUI execution adapter.",
    href: "/generate",
    icon: Sparkles,
    badge: "Live",
  },
  {
    title: "Replicate video",
    description: "Decompose, reverse and reconstruct a reference video while preserving chosen locks.",
    icon: Clapperboard,
    badge: "P1",
  },
  {
    title: "Analyze shots",
    description: "Run automatic shot analysis or open the detector diagnostics workspace.",
    href: "/analysis",
    icon: ScanLine,
    badge: "Live",
  },
  {
    title: "Manage assets",
    description: "Upload source video, inspect derived assets and run keyframe extraction.",
    href: "/projects",
    icon: FolderOpen,
    badge: "Live",
  },
];

export default function Home() {
  const inspector = (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current vertical slice</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Capability → Job → Asset</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The control plane resolves capabilities to workflows/models and keeps durable job and asset lineage around every operation.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Infrastructure</CardTitle>
          <CardDescription>Stable foundations already in use.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /> PostgreSQL durable state</div>
          <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /> Valkey worker queue</div>
          <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /> S3-compatible assets</div>
          <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /> Model / Workflow registry</div>
          <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /> ComfyUI generation adapter</div>
        </CardContent>
      </Card>

      <Button asChild className="w-full">
        <Link href="/generate"><Sparkles /> Open generate</Link>
      </Button>
    </div>
  );

  return (
    <AppShell
      active="workspace"
      eyebrow="VIDEO AI WORKBENCH"
      inspector={inspector}
      status="P0 · real data"
      title="Workspace"
    >
      <div className="space-y-8">
        <Card className="overflow-hidden">
          <CardContent className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-3xl">
              <Badge variant="secondary"><Workflow className="size-3" /> Capability first</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Understand → Generate → Reconstruct → Deliver
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Keep product semantics stable while models, workflows, workers and storage providers evolve behind adapters.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/generate">Generate video</Link>
            </Button>
          </CardContent>
        </Card>

        <section>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Quick actions</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Core workflows</h2>
            </div>
            <span className="text-sm text-muted-foreground">Build UI around capabilities, not engines.</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {quickActions.map(({ title, description, href, icon: Icon, badge }) => {
              const card = (
                <Card className="h-full transition-colors hover:border-ring/60 hover:bg-accent/20">
                  <CardHeader>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                        <Icon className="size-5" />
                      </div>
                      <Badge variant={badge === "Live" ? "success" : "outline"}>{badge}</Badge>
                    </div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              );

              return href ? (
                <Link className="block h-full" href={href} key={title}>{card}</Link>
              ) : (
                <div className="h-full opacity-70" key={title}>{card}</div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
