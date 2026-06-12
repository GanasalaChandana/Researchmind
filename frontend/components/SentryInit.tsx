"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.05,
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.01,
      integrations: [
        Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      ],
    });
  }, []);
  return null;
}
