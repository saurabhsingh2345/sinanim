import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Self-hosted variable fonts (see styles/globals.css @font-face).
            Preload so the canvas Player has glyphs before first paint. */}
        <link rel="preload" href="/fonts/Inter.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/SpaceGrotesk.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/JetBrainsMono.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <meta
          name="description"
          content="Turn a prompt into a clean, exportable code-animation video — powered by local open-source models."
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
