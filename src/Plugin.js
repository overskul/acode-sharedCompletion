import { FileCompleter } from "./FileCompleter.js";

export class SharedCompletion {
  static COMPLETER_ID = "SharedCompletion";

  _fileCompleter = new FileCompleter();
  _completer = {
    id: SharedCompletion.COMPLETER_ID,
    getCompletions: async (editor, session, pos, prefix, callback) => {
      const currentFile = editorManager.activeFile;
      const currentFileName = currentFile?.filename || currentFile?.name || 'untitled';

      const completions = this._fileCompleter.getCompletions(prefix, currentFileName);
      callback(null, completions);
    }
  };
  _scanTimeout;
  _isScanning = false;

  constructor(plugin) {
    // plugin constructor
  }

  async init(baseUrl, $page, { cacheFileUrl, cacheFile, firstInit }) {
    const { editor } = editorManager;

    editor.setOptions({
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: true
    });

    if (!editor.completers) editor.completers = [];
    if (!editor.completers.includes(this._completer))
      editor.completers.push(this._completer);

    await this.#scanFiles();
    editorManager.on('switch-file', this._handleFileScanQuick);
    editorManager.on('file-loaded', this._handleFileScanQuick);
    editorManager.on('file-content-changed', this._handleFileScanSlow);
    editorManager.on('remove-file', this._handleFileRemove);

    console.log("✓ Cross-file autocompletion enabled!");
    console.log(`  Completers: ${editor.completers.length}`);
    console.log(`  Files tracked: ${editorManager.files.length}`);
  }

  async destroy() {
    const { editor } = editorManager;
    editor.completers = editor.completers?.filter(c => c?.id !== SharedCompletion.COMPLETER_ID) || [];

    editorManager.off('switch-file', this._handleFileScanQuick);
    editorManager.off('file-loaded', this._handleFileScanQuick);
    editorManager.off('file-content-changed', this._handleFileScanSlow);
    editorManager.off('remove-file', this._handleFileRemove);

    clearTimeout(this._scanTimeout);
    this._fileCompleter.clear();

    console.log("✓ Cross-file autocompletion destroyed!");
  }

  get pSettings() {
    return {
      list: [],
      cb: (key, value) => {}
    };
  }

  async #scanFiles() {
    const { files, editor } = editorManager;
    if (!files) return;

    const baseCompleters = (editor.completers || []).filter(c => c?.id !== SharedCompletion.COMPLETER_ID);
    for (const file of files) {
      const session = file.session;
      const fileName = file.filename || file.name || 'untitled';

      await this._fileCompleter.collectSession(fileName, session, baseCompleters);
    }
  }

  async #debouncedScan(delay = 200) {
    if (this._isScanning) return;

    clearTimeout(this._scanTimeout);
    this._scanTimeout = setTimeout(async () => {
      this._isScanning = true;
      await this.#scanFiles();
      this._isScanning = false;
    }, delay);
  }

  _handleFileScanQuick = this.#handleFileScanQuick.bind(this);
  #handleFileScanQuick() {
    this.#debouncedScan(100);
  }

  _handleFileScanSlow = this.#handleFileScanSlow.bind(this);
  #handleFileScanSlow() {
    this.#debouncedScan(3000);
  }

  _handleFileRemove = this.#handleFileRemove.bind(this);
  #handleFileRemove(file) {
    const fileName = file.filename || file.name || 'untitled';
    this._fileCompleter.removeFile(fileName);
  }
}