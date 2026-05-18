"use client";

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { authClient } from "~/clients/auth/react";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [, navigate] = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    authClient.getSession().then((result) => {
      if (!result.data?.session) {
        navigate("/login");
      }
      setChecking(false);
    });
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
