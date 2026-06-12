"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function SentryInit() {
  useEffect(() => {
    Sentry.init({
      dsn: "https://8fd2bc930b83be6ab71ebdcbe2ede5be@o4511550212079616.ingest.us.sentry.io/4511550216273920",
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
