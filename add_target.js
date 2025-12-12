import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from 'fs';
import path from 'path';
import prompt from 'prompt';
prompt.message = '';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const default_user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36";

var config = {}
if (fs.existsSync('./targets.json')) {
  config = JSON.parse(fs.readFileSync('./targets.json'))
}

var cuddlephish_config = JSON.parse(fs.readFileSync('./config.json'))
var captured_favicon = false;
var desperate = false;
var super_desperate = false;
var favicon_url = '';

(async () => {
  let puppet_options = [
    "--ignore-certificate-errors",
    "--disable-blink-features=AutomationControlled",
    "--start-maximized",
    "--no-sandbox",
  ]

  if (cuddlephish_config.proxy !== undefined) {
    puppet_options.push("--proxy-server=" + cuddlephish_config.proxy)
  }

  const browser = await puppeteer.launch({
    headless: "new",
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: null,
    args: puppet_options
  });

  const page = await browser.newPage();
  await page.setUserAgent(default_user_agent)
  await page.setCacheEnabled(false);

  const { login_page } = await prompt.get([{ name: 'login_page', description: 'URL of Login Page to Target', type: 'string' }]);
  const short_name = login_page.split("/")[2].split('.').slice(-2, -1)[0]

  page.on('response', async response => {
    let mime_type = response.headers()['content-type']
    if (mime_type === 'image/x-icon' || mime_type === 'image/vnd.microsoft.icon' || (desperate && /image/.test(mime_type)) || super_desperate) {
      captured_favicon = true
      console.log(`Collected Favicon From: ${response.url()}`)
      response.buffer().then(file => {
        const fileName = `favicons/${short_name}.ico`;
        const filePath = path.resolve(__dirname, fileName);
        const writeStream = fs.createWriteStream(filePath);
        writeStream.write(file);
      }).catch(err => {
        console.log(`Error saving favicon: ${err.message}`);
      });
    }
  });

  let final_url = login_page;
  let page_loaded = false;

  try {
    await page.goto(login_page, {
      waitUntil: ['load', 'domcontentloaded', 'networkidle2']
    });

    // Get the final URL after any redirects
    final_url = page.url();
    console.log(`Final URL after redirects: ${final_url}`);
    page_loaded = true;

  } catch (err) {
    console.log("Error loading URL:", err.message);
  }

  let title = '';
  if (page_loaded) {
    try {
      // Wait a bit more to ensure page is fully ready
      await page.waitForFunction('document.readyState === "complete"', { timeout: 5000 }).catch(() => { });
      title = await page.evaluate('document.title');
      console.log(`Target Tab Title: ${title}`)
    } catch (err) {
      console.log("Error getting page title:", err.message);
      title = '';
    }
  }

  if (!captured_favicon && page_loaded) {
    console.log(`Failed to Passively Collect Favicon... Attempting to Manually Extract`)
    try {
      favicon_url = await page.evaluate('const iconElement = document.querySelector("link[rel~=icon]");const href = (iconElement && iconElement.href) || "/favicon.ico";const faviconURL = new URL(href, window.location).toString();faviconURL;');
      desperate = true
      await page.goto(favicon_url, {
        waitUntil: ['load', 'domcontentloaded', 'networkidle2']
      })
    } catch (err) {
      console.log("Error loading favicon URL:", err.message);
    }
  }

  if (!captured_favicon && favicon_url) {
    console.log(`Failed to Actively Collect Favicon... Attempting One Last Try`)
    super_desperate = true
    try {
      await page.goto(favicon_url, {
        waitUntil: ['load', 'domcontentloaded', 'networkidle2']
      })
    } catch (err) {
      console.log("Error on final favicon attempt:", err.message);
    }
  }

  if (!captured_favicon) {
    console.log(`Failed to Actively Collect Favicon... Try Downloading it Yourself and Name it ./favicons/${short_name}.ico`)
  }

  config[short_name] = {
    login_page: login_page,
    boot_location: final_url,
    tab_title: title,
    favicon: `${short_name}.ico`,
    payload: `payload.txt`,
  }

  fs.writeFileSync(`./targets.json`, `${JSON.stringify(config, null, 2)}`)

  await browser.close();
})();
