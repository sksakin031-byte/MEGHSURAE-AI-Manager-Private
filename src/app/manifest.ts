import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MEGHSURAE AI Manager",
    short_name: "MEGHSURAE",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f19",
    theme_color: "#4f46e5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
