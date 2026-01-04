export class FileCompleter {
  constructor() {
    this.completions = new Map();
  }

  async collectSession(fileName, session, completers) {
    const allCompletions = [];
    const pos = {
      row: 0,
      column: 0
    };
    const editorStub = {
      session: session,
      getSession: () => session,
      getCursorPosition: () => pos,
      completers: completers
    };

    return new Promise((resolve) => {
      let pending = completers.length;
      if (pending === 0) {
        this.completions.set(fileName, []);
        resolve([]);
        return;
      }

      completers.forEach(completer => {
        if (!completer.getCompletions) {
          pending--;
          if (pending === 0) {
            this.completions.set(fileName, allCompletions);
            resolve(allCompletions);
          }
          return;
        }
        try {
          completer.getCompletions(editorStub, session, pos, '', (err, completions) => {
            if (!err && completions) {
              allCompletions.push(...completions);
            }
            pending--;
            if (pending === 0) {
              this.completions.set(fileName, allCompletions);
              resolve(allCompletions);
            }
          });
        } catch (e) {
          pending--;
          if (pending === 0) {
            this.completions.set(fileName, allCompletions);
            resolve(allCompletions);
          }
        }
      });
    });
  }

  getCompletions(prefix, currentFileName = null) {
    const merged = [];
    const seen = new Set();
    const processFile = (fileName, completions, isCurrentFile) => {
      completions.forEach(comp => {
        const val = comp.value || comp.caption;
        if (!val || seen.has(val)) return;

        if (!prefix || val.toLowerCase().startsWith(prefix.toLowerCase())) {
          seen.add(val);
          const filename = fileName.split('/').pop();
          const originalMeta = comp.meta || '';
          const meta = isCurrentFile 
            ? originalMeta || 'local'
            : (originalMeta ? `${originalMeta} | ${filename}` : filename);

          merged.push({
            ...comp,
            meta: meta,
            score: isCurrentFile ? (comp.score || 1000) + 1000 : (comp.score || 1000)
          });
        }
      });
    };

    if (currentFileName && this.completions.has(currentFileName)) {
      processFile(currentFileName, this.completions.get(currentFileName), true);
    }

    for (const [fileName, completions] of this.completions) {
      if (fileName === currentFileName) continue;
      processFile(fileName, completions, false);
    }

    return merged;
  }

  removeFile(fileName) {
    this.completions.delete(fileName);
  }

  clear() {
    this.completions.clear();
  }
}