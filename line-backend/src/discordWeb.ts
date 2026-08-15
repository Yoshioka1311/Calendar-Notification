import { DISCORD_WEB_APP } from './discordWebApp.ts';
import { DISCORD_WEB_PAGE } from './discordWebPage.ts';
import { DISCORD_WEB_STYLES } from './discordWebStyles.ts';

function response(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      'Cache-Control': contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src https: data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Content-Type': `${contentType}; charset=utf-8`,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}

export function serveDiscordWeb(pathname: string): Response | undefined {
  if (pathname === '/discord' || pathname === '/discord/') return response(DISCORD_WEB_PAGE, 'text/html');
  if (pathname === '/discord/styles.css') return response(DISCORD_WEB_STYLES, 'text/css');
  if (pathname === '/discord/app.js') return response(DISCORD_WEB_APP, 'text/javascript');
  return undefined;
}
