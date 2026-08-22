import packageJson from "../../package.json";

const APP_VERSION = packageJson.version;

const WIKIMEDIA_API_USER_AGENT = `Perseus Wikimedia Provider/${APP_VERSION} (https://github.com/wikimediairan/Perseus; alireza3205@gmail.com)`;

export const WIKIMEDIA_HEADERS = {
  "User-Agent": WIKIMEDIA_API_USER_AGENT,
} as const;
