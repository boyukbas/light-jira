// Ambient declarations so `tsc --checkJs` can resolve the third-party <script>
// globals (lib/*.js) and the app's cross-file globals. Loose `any` typing — this
// is a lint aid (see tsconfig.json checkJs), not a real type model.

// ── Third-party libraries (loaded via <script> from lib/) ──────────────────────
declare const mermaid: any;
declare const Fuse: any;
declare const hljs: any;
declare const dayjs: any;
declare const dayjs_plugin_relativeTime: any;

// ── App state shapes ───────────────────────────────────────────────────────────
// The @typedef blocks in js/state.js are line comments, so tsc never sees them.
type Group = {
  id: string;
  name: string;
  keys: (string | { key: string; added: number })[];
  isFilter?: boolean;
  query?: string;
};
type AppState = any;

// ── Cross-file global functions ────────────────────────────────────────────────
// Defined via `window.X = ...` in one file and called bare in another.
declare const handleDragStart: any;
declare const handleGroupDragStart: any;
declare const handleDragOver: any;
declare const handleDragLeave: any;
declare const handleDropToGroup: any;
declare const handleDropToItem: any;
declare const moveTicket: any;
declare const viewByLabel: any;
declare const forceRefreshReading: any;
declare const addToHistory: any;
declare const openFromHistory: any;
declare const closeLabelPicker: any;
declare const toggleCollapse: any;

interface Window {
  handleDragStart: any;
  handleGroupDragStart: any;
  handleDragOver: any;
  handleDragLeave: any;
  handleDropToGroup: any;
  handleDropToItem: any;
  moveTicket: any;
  viewByLabel: any;
  forceRefreshReading: any;
  addToHistory: any;
  openFromHistory: any;
  closeLabelPicker: any;
  toggleCollapse: any;
  getState: any;
  update: any;
}
