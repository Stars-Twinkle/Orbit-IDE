'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  version: 1,
  mode: 'oi',
  workspace: null,
  recentWorkspaces: [],
  fontSize: 14,
  tabSize: 4,
  wordWrap: 'off',
  minimap: true,
  autoSave: false,
  fontLigatures: true,
  autoComplete: true,
  o2Optimization: true,
  aiActivityEnabled: true,
  aiActivityAutoOpen: true,
  aiAutoSwitch: true,
  aiDiffFlash: true,
  aiDiffFlashDuration: 900,
  compilerScanDirs: [],
  aiPort: 37821,
  selectedCompilers: {},
  selectedStandards: {},
  trustedClients: [],
  customCompilers: [],
  windowBounds: null,
  compilerCache: [],
  compilerScanAt: null,
  oiPanelHeight: 340,
  lastOpenFile: null,
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

class SettingsStore {
  constructor(userDataDir) {
    this.dir = userDataDir;
    this.file = path.join(userDataDir, 'settings.json');
    this.data = deepClone(DEFAULTS);
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.data = { ...deepClone(DEFAULTS), ...parsed };
        if (!Array.isArray(this.data.recentWorkspaces)) this.data.recentWorkspaces = [];
        if (!Array.isArray(this.data.trustedClients)) this.data.trustedClients = [];
        if (!this.data.selectedCompilers || typeof this.data.selectedCompilers !== 'object') {
          this.data.selectedCompilers = {};
        }
        if (!this.data.selectedStandards || typeof this.data.selectedStandards !== 'object') {
          this.data.selectedStandards = {};
        }
      }
    } catch {
      // 首次启动或配置损坏时使用默认值。
    }
  }

  all() {
    return this.data;
  }

  get(key, fallback) {
    return this.data[key] === undefined ? fallback : this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return value;
  }

  patch(patch) {
    Object.assign(this.data, patch);
    this.save();
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('[settings] 保存失败:', error);
    }
  }
}

module.exports = { SettingsStore, DEFAULTS };
