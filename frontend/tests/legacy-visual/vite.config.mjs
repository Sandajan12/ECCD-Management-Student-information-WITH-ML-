import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";
const root = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(root, "../..");
const legacyRoot = resolve(appRoot, "../AMES-SYSTEM-LEGACY/frontend");
const settings = {
  school_name: "Example School",
  principal_name: "Example Principal",
  current_school_year: "2026-2027",
  school_year_start_month: 8,
  primary_color: "#2563eb",
  logo_url:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ffffff'/%3E%3Ctext x='50' y='64' font-size='40' text-anchor='middle' fill='%232563eb'%3EA%3C/text%3E%3C/svg%3E",
};
export default defineConfig({
  root,
  plugins: [
    react(),
    {
      name: "legacy-reference-context",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "virtual:legacy-global.css")
          return "\0legacy-global.css";
        if (
          !importer
            ?.replaceAll("\\", "/")
            .startsWith(legacyRoot.replaceAll("\\", "/") + "/")
        )
          return;
        source = source.replace(/\.(jsx?|tsx?)$/, "");
        if (source.endsWith("context/SettingsContext"))
          return "\0reference-settings";
        if (source.endsWith("context/AuthContext")) return "\0reference-auth";
        if (source.endsWith("services/api")) return "\0reference-api";
        if (source.endsWith("services/trustedDevice"))
          return "\0reference-device";
        if (source.endsWith("services/socket")) return "\0reference-socket";
      },
      async load(id) {
        if (id === "\0legacy-global.css") {
          // Read the original stylesheet; the same font files are loaded locally.
          const source = (
            await readFile(resolve(legacyRoot, "src/index.css"), "utf8")
          ).replace(/^@import url.*$/gm, "");
          const config = (
            await import(
              pathToFileURL(resolve(legacyRoot, "tailwind.config.js")).href
            )
          ).default;
          const result = await postcss([
            tailwind({
              ...config,
              content: [resolve(legacyRoot, "src/**/*.{jsx,js}")],
            }),
            autoprefixer(),
          ]).process(source, { from: resolve(legacyRoot, "src/index.css") });
          return result.css;
        }
        if (id === "\0reference-settings")
          return `import {createContext,useContext} from 'react'; const state={setSettings:()=>{},settings:${JSON.stringify(settings)}}; document.documentElement.style.setProperty('--primary-color',state.settings.primary_color); export const SettingsContext=createContext(state); export const useSettings=()=>useContext(SettingsContext);`;
        if (id === "\0reference-auth")
          return `export const useAuth=()=>({user:{...JSON.parse(localStorage.getItem('user')||'{}'),role:new URLSearchParams(window.location.search).get('role')||'user'},requiresPasswordChange:window.location.pathname==='/first-login',login:()=>{},logout:()=>{}});`;
        if (id === "\0reference-api")
          return `export const API_URL='http://127.0.0.1:8767'; export const apiFetch=async(url,options)=>(['teacher','chairman','parent'].some(role=>window.location.pathname.startsWith('/'+role+'/'))) ? fetch(url,options) : ({ok:true,json:async()=>({unreadCount:0})}); export default {post:async()=>({data:{success:true,requireOtp:true,challengeToken:'reference',emailSent:true}}),put:async()=>({data:{success:false}})};`;
        if (id === "\0reference-socket")
          return `const socket={on:()=>{},off:()=>{},emit:()=>{}}; export const connectSocket=()=>socket; export const getSocket=()=>socket;`;
        if (id === "\0reference-device")
          return `export const getDeviceToken=()=>null; export const clearDeviceToken=()=>{};`;
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^@mui\/material(.*)$/,
        replacement: resolve(root, "node_modules/@mui/material/esm") + "$1",
      },
      {
        find: /^@mui\/icons-material(.*)$/,
        replacement:
          resolve(root, "node_modules/@mui/icons-material/esm") + "$1",
      },
      {
        find: /^react-dom(\/.*)?$/,
        replacement: resolve(appRoot, "node_modules/react-dom") + "$1",
      },
      {
        find: /^react(\/.*)?$/,
        replacement: resolve(appRoot, "node_modules/react") + "$1",
      },
      {
        find: /^react-router-dom$/,
        replacement: resolve(appRoot, "node_modules/react-router-dom"),
      },
      {
        find: /^recharts$/,
        replacement: resolve(appRoot, "node_modules/recharts"),
      },
      {
        find: /^@fontsource\/poppins(.*)$/,
        replacement:
          resolve(appRoot, "node_modules/@fontsource/poppins") + "$1",
      },
    ],
  },
  server: {
    host: "localhost",
    port: 5187,
    strictPort: true,
    fs: { allow: [resolve(appRoot, ".."), root] },
  },
});
