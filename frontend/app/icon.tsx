import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Sparkle / star shape */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L13.5 9.5L21 12L13.5 14.5L12 22L10.5 14.5L3 12L10.5 9.5L12 2Z"
            fill="white"
            strokeWidth="0"
          />
          <circle cx="18" cy="6" r="1.5" fill="white" opacity="0.7" />
          <circle cx="6" cy="18" r="1" fill="white" opacity="0.5" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
