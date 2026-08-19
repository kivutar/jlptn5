(function exposeCapacitorSynapse(global) {
  "use strict";

  // The Filesystem UMD bundle expects this dependency under its historical
  // global name. Bundled ESM applications get the dependency through imports.
  global.synapse ||= global.outsystemsSynapse;
})(globalThis);
