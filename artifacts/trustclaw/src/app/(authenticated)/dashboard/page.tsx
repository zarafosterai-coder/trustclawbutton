"use client";

import { trpc } from "~/clients/trpc";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { TrustClawChat } from "./_components/chat/trustclaw-chat";
import { OnboardingClient } from "./_components/onboarding/onboarding-client";

export default function Page() {
  const { data: status, isLoading } = trpc.trustclaw.getStatus.useQuery();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (!status?.hasInstance) {
    return (
      <ErrorBoundary>
        <OnboardingClient
          hasExistingInstance={status?.hasInstance ?? false}
          hasOnboardingState={status?.hasOnboardingState ?? false}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TrustClawChat />
    </ErrorBoundary>
  );
}
