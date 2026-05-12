"use client";

import { Button } from "@iskotify/ui";
import { APP_NAME } from "@iskotify/utils";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6">
      <h1 className="text-4xl font-bold tracking-tight">
        {APP_NAME} Admin Dashboard
      </h1>
      <p className="text-ink-muted">
        Shared component rendered below comes from{" "}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">
          @iskotify/ui
        </code>{" "}
        and is the same source used by the mobile app.
      </p>

      <div className="flex flex-row gap-3">
        <Button
          label="Primary action"
          onPress={() => console.log("admin: primary pressed")}
        />
        <Button
          variant="secondary"
          label="Secondary"
          onPress={() => console.log("admin: secondary pressed")}
        />
      </div>
    </main>
  );
}
