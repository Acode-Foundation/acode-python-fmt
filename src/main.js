import plugin from "../plugin.json";
import init, { Workspace } from "@astral-sh/ruff-wasm-web";

const appSettings = acode.require("settings");
const loader = acode.require("loader");

class RuffFormatter {
  constructor() {
    if (!appSettings.value[plugin.id]) {
      this._saveSetting();
    } else {
      if (
        !Object.prototype.hasOwnProperty.call(this.settings, "line_length")
      ) {
        delete appSettings.value[plugin.id];
        appSettings.update(false);
        this._saveSetting();
      }
    }
  }
  
  _saveSetting() {
    appSettings.value[plugin.id] = {
      indent_style: "space",
      indent_width: 4,
      line_length: 88,
      line_ending: "auto",
      quote_style: "double",
      skip_magic_trailing_comma: false,
      docstring_code_format: false,
    };
    appSettings.update(false);
  }

  async init() {
    await init({ module_or_path: `${this.baseUrl}wasm/ruff_wasm_bg.wasm` });

    this.workspace = this.createWorkspace();

    acode.registerFormatter(
      plugin.id,
      ["py", "pyi", "pyx", "pxd", "pxi", "rpy"],
      this.format.bind(this),
    );
  }

  async format() {
    try {
      const { editor, activeFile } = editorManager;
      if (!activeFile || !editor) return;

      const { session } = editor;
      const code = editor.getValue();

      loader.showTitleLoader();

      try {
        // First check for syntax errors
        const diagnostics = this.workspace?.check(code);
        if (diagnostics && diagnostics.length > 0) {
          // Clear existing markers
          session.clearAnnotations();

          const annotations = diagnostics.map((diag) => ({
            row: diag.start_location.row - 1,
            column: diag.start_location.column,
            text: `${diag.code}: ${diag.message}`,
            type: "error",
          }));

          session.setAnnotations(annotations);
        }

        const res = this.workspace.format(code);
        this.setValueToEditor(session, res);
      } catch (error) {
        acode.alert("Ruff Plugin", `Format failed: ${error.message}`);
      }
    } finally {
      loader.removeTitleLoader();
    }
  }

  createWorkspace() {
    return new Workspace({
      "line-length": this.settings.line_length,
      "indent-width": this.settings.indent_width,
      format: {
        "indent-style": this.settings.indent_style,
        "quote-style": this.settings.quote_style,
        "line-ending": this.settings.line_ending,
        "skip-magic-trailing-comma": this.settings.skip_magic_trailing_comma,
        "docstring-code-format": this.settings.docstring_code_format
      },
    });
  }

  setValueToEditor(session, formattedCode) {
    const { $undoStack, $redoStack, $rev, $mark } = Object.assign(
      {},
      session.getUndoManager(),
    );
    session.setValue(formattedCode);
    const undoManager = session.getUndoManager();
    undoManager.$undoStack = $undoStack;
    undoManager.$redoStack = $redoStack;
    undoManager.$rev = $rev;
    undoManager.$mark = $mark;
  }

  async destroy() {
    if (this.workspace) {
      this.workspace.free();
    }
    acode.unregisterFormatter(plugin.id);
  }

  get settingsObj() {
      console.log(this.settings.line_length)
    return {
      list: [
        {
          key: "indent_style",
          text: "Indent Style",
          value: this.settings.indent_style,
          info: "The style of indentation - space or tab",
          select: ["space", "tab"],
        },
        {
          key: "indent_width",
          text: "Indent Width",
          value: this.settings.indent_width,
          info: "Number of spaces per indentation level (default: 4)",
          prompt: "Indent Width",
          promptType: "number",
          promptOption: [
            {
              required: true,
            },
          ],
        },
        {
          key: "line_length",
          text: "Line Length",
          value: this.settings.line_length,
          info: "Maximum allowed line length (default: 88)",
          prompt: "Line Length",
          promptType: "number",
          promptOption: [
            {
              required: true,
            },
          ],
        },
        {
          key: "line_ending",
          text: "Line Ending",
          value: this.settings.line_ending,
          info: "Line ending style (default: auto)",
          select: ["auto", "lf", "crlf", "native"],
        },
        {
          key: "quote_style",
          text: "Quote Style",
          value: this.settings.quote_style,
          info: "The style of string quotes to use (default: double)",
          select: ["double", "single", "preserve"],
        },
        {
          key: "skip_magic_trailing_comma",
          text: "Skip Magic Trailing Comma",
          value: this.settings.skip_magic_trailing_comma,
          checkbox: !!this.settings.skip_magic_trailing_comma,
          info: "Skip magic trailing comma handling",
        },
        {
          key: "docstring_code_format",
          text: "Format Docstring Code",
          value: this.settings.docstring_code_format,
          checkbox: !!this.settings.docstring_code_format,
          info: "Format code blocks in docstrings",
        },
      ],
      cb: (key, value) => {
        this.settings[key] = value;
        appSettings.update();

        // Recreate workspace with new settings
        if (this.workspace) {
          this.workspace.free();
        }
        this.workspace = this.createWorkspace();
      },
    };
  }

  get settings() {
    return appSettings.value[plugin.id];
  }
}

if (window.acode) {
  const acodePlugin = new RuffFormatter();
  acode.setPluginInit(
    plugin.id,
    async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
      if (!baseUrl.endsWith("/")) {
        baseUrl += "/";
      }
      acodePlugin.baseUrl = baseUrl;
      await acodePlugin.init($page, cacheFile, cacheFileUrl);
    },
    acodePlugin.settingsObj,
  );
  acode.setPluginUnmount(plugin.id, () => {
    acodePlugin.destroy();
  });
}
