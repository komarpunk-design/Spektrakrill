import { createFileRoute } from "@tanstack/react-router";
import { DarkroomApp } from "@/components/darkroom/app";
import { APP_NAME, APP_TAGLINE, THEME_COLOR } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: `${APP_NAME} — ${APP_TAGLINE}` },
      { name: "theme-color", content: THEME_COLOR },
    ],
  }),
  component: Home,
});

function Home() {
  return <DarkroomApp />;
}
