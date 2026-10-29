'use strict';
/**
 * Chrome browser manager for the Amazon scraper (Node.js port of browser.py).
 * Persistent profiles + anti-detection flags. selenium-webdriver is loaded lazily so the
 * web server / turbo engine keep working on hosts (Render, Vercel, Docker) without Chrome.
 */

const fs = require('node:fs');
const path = require('node:path');

function loadSelenium() {
  try {
    return {
      ...require('selenium-webdriver'),
      chrome: require('selenium-webdriver/chrome'),
    };
  } catch {
    throw new Error(
      'selenium-webdriver is not installed. Run `npm install selenium-webdriver` to use the browser engine.',
    );
  }
}

/** Find the installed Google Chrome binary (Windows paths, or CHROME_BINARY env). '' = let Selenium decide. */
function detectChromeBinary() {
  const envBin = process.env.CHROME_BINARY;
  if (envBin && fs.existsSync(envBin)) return envBin;

  const roots = [
    process.env.PROGRAMFILES || 'C:\\Program Files',
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    process.env.LOCALAPPDATA || '',
  ];
  for (const r of roots) {
    if (!r) continue;
    const p = path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function buildChromeOptions(chrome, { profilePath, headless = false, userAgent = null, stealth = true }) {
  const options = new chrome.Options();
  const binary = detectChromeBinary();
  if (binary) options.setChromeBinaryPath(binary);

  fs.mkdirSync(profilePath, { recursive: true });
  options.addArguments(`--user-data-dir=${path.resolve(profilePath)}`, '--profile-directory=Default');

  if (headless) options.addArguments('--headless=new'); // modern headless avoids easy bot detection

  options.addArguments(
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1380,940',
    '--lang=en-IN',
    '--disable-notifications',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--remote-allow-origins=*',
  );

  if (userAgent) options.addArguments(`--user-agent=${userAgent}`);

  if (stealth) {
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.excludeSwitches('enable-automation');
  }

  options.setUserPreferences({
    'profile.default_content_setting_values.notifications': 2,
    credentials_enable_service: false,
    'profile.password_manager_enabled': false,
  });

  return options;
}

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.navigator.chrome = { runtime: {} };
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`;

/** Initialise a Selenium WebDriver with stealth + persistent profile. */
async function getDriver({
  profilesDir,
  profileName = 'default_profile',
  headless = false,
  userAgent = null,
  stealth = true,
} = {}) {
  const { Builder, chrome } = loadSelenium();
  const options = buildChromeOptions(chrome, {
    profilePath: path.join(profilesDir, profileName),
    headless,
    userAgent,
    stealth,
  });

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  if (stealth) {
    try {
      await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', { source: STEALTH_SCRIPT });
    } catch {
      /* CDP not available - carry on without JS injection */
    }
  }
  return driver;
}

/** Clear saved profile cookies and state. */
function resetProfile(profilesDir, profileName = 'default_profile') {
  const pdir = path.join(profilesDir, profileName);
  if (!fs.existsSync(pdir)) return false;
  try {
    fs.rmSync(pdir, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.log(`[!] Error resetting profile: ${e.message}`);
    return false;
  }
}

module.exports = { getDriver, resetProfile, detectChromeBinary };
