import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Canto to Mando Blueprint LMS",
    short_name: "Canto to Mando",
    description: "Interactive Mandarin & Cantonese learning platform",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#030712",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
