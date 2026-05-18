"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export function ModelSettings({ currentModel: _ }: { currentModel: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model</CardTitle>
        <CardDescription>
          AI model powering your assistant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">minimax-m2.5-free</span>
          <span className="text-muted-foreground text-xs">(OpenCode Zen)</span>
        </div>
      </CardContent>
    </Card>
  );
}
