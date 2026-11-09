// Tests e2e: el sitio compilado (dist/) en navegadores reales con perfil de móvil en horizontal.
// En local: npm run test:e2e (la primera vez, npx playwright install chromium webkit).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    // Chrome en Android y Safari en iPhone, con el viewport que deja el navegador en horizontal
    { name: 'android', use: { ...devices['Pixel 7 landscape'] } },
    { name: 'iphone', use: { ...devices['iPhone 13 landscape'] } },
  ],
  // Se prueba lo mismo que se despliega: build (con postbuild) y astro preview sirviendo dist/.
  // --ignore-lock deja el servidor en primer plano para que Playwright lo arranque y lo pare (si Astro detecta que lo
  // lanza un agente de IA, sin esta opción lo pasaría a segundo plano y Playwright creería que ha terminado).
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
