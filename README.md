# Cppcheck Lite

**Cppcheck Lite2** is a minimalistic Visual Studio Code extension that runs [Cppcheck](https://cppcheck.sourceforge.net/) against C/C++ files upon save and reports any warnings or errors in the Problems panel. This is version is based of https://github.com/JustusRijke/Cppcheck-Lite by JustusRijke. Cppcheck Lite2 uses compile_commands.json to give Cppcheck the information needed to analyse a complex project. Cppcheck Lite2 also uses a .cppcheck-config file to customize how Cppcheck checks individual files. You can think of a .cppcheck-config file as of a .clang-tidy or .clang-format file. 

## Features

- **On-save linting**: When you save a c/cpp file, `cppcheck` is automatically run on that file.
- **Per-file diagnostics**: Only diagnostics relevant to the saved file are displayed.
- **Configurable severity threshold**: Filter out messages below a chosen severity level (`info`, `warning`, or `error`).
- **.cppcheck-config**: Easily configure Cppcheck by adding a .cppcheck-config file to your project
- **Diagnostic cleanup**: When you close a file, its diagnostics are automatically cleared.

## Requirements

 **Cppcheck** must be installed on your system.  
  - By default, this extension looks for `cppcheck` on the system PATH.
  - Alternatively, specify a custom executable path using the e`cppcheck-lite2.path` setting.

Examples of installing Cppcheck:
  - On Linux (Debian/Ubuntu), install via `sudo apt-get install cppcheck`.
  - On macOS with Homebrew: `brew install cppcheck`.
  - On Windows, install from [cppcheck's website](https://cppcheck.sourceforge.net/).

A .cppcheck-config file in the same folder or up from the file that is being checked. This means you are best off to add a .cppcheck-config file in the root of your project. Each line in the .cppcheck-config represents a parameter for Cppcheck. 

Example: 
```
--std=c++17
--check-level=exhaustive
-DTEST=1
```

Do not specifiy a template, this tool uses a custom template to parse the output of Cppcheck. 

## Extension Settings

This extension contributes the following settings under `cppcheck-lite.*`:

- **`cppcheck-lite2.enable`**: (boolean) Enable or disable the extension.  
- **`cppcheck-lite2.minSeverity`**: (string) Minimum severity to report (`info`, `warning`, or `error`).  `info` shows style, performance, portability and information messages.
- **`cppcheck-lite2.compileCommandsPath"`**: (string) The path relative to the root of the workspace to the compile_commands.json. By default it searches the workspace root. This works well with the "cmake.copyCompileCommands" setting if you set it to "${workspaceFolder}/compile_commands.json".
- **`cppcheck-lite2.path`**: (string) Path to the `cppcheck` executable. If left empty, `cppcheck` from the system PATH is used.
- **`cppcheck-lite2.BuildDirectory`**: Relative path to the workspace where Cppcheck will output it's build output. If empty, uses the workspace workspaceRoot/cppcheck-lite2-build

## Reporting Issues
Please submit any issues or feature requests via the [GitHub Issues page](https://github.com/EmielEstievenart/Cppcheck-Lite2/issues).

---

**Enjoy using Cppcheck Lite2!**
